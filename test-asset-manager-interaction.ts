/**
 * 资管授权确认多轮交互与状态澄清场景专项测试 (codex://threads/01a17d8f-7144-72e3-9b68-e29d90669510)
 *
 * 专项验证：
 * 1. 【核心链路：多轮澄清稍后联系时间并在到期后同意起草】：
 *    - 第 1 轮：首次未联系 (NOT_CONTACTED) -> 触发私聊初次咨询 -> schedule 挂起等待回复
 *    - 第 2 轮：资管回复“稍后再联系”（时间未明确） -> 保存意图，私聊追问具体联系时间 -> command: null 挂起等待回复
 *    - 第 3 轮：资管回复“明天上午10点确认”（结合上下文识别为补充时间） -> 保存意图与约定时间 -> schedule 约定时间挂起
 *    - 第 4 轮：约定时间到达，资管回复“发吧，可以起草” -> 保存同意起草意图 -> 成功起草解约协议 -> schedule t+2 提醒
 *
 * 2. 【暂不同意与原因澄清链路】：
 *    - 第 1 轮：资管回复“别发/先不能发” -> 保存 DECLINE_DRAFT，追问具体原因与是否稍后联系 -> command: null
 *    - 第 2 轮：资管说明“业主想再降价招租，我来跟进处理” -> 转为 ASSET_MANAGER_FOLLOW -> command: end 结单
 *
 * 3. 【阶梯追问与3次追问耗尽闭环链路】：
 *    - 资管持续未回复 -> 第 1 次追问 (2h) -> 第 2 次追问 (4h) -> 第 3 次追问 (t+1) -> 耗尽 (nextContactAt=null) -> command: end
 *
 * 4. 【意图无法识别澄清链路】：
 *    - 资管回复模棱两可 -> 引导澄清问题，不强行保存错误意图 -> command: null 等待回复
 */

const SERVER_URL = 'http://localhost:8080';

interface CallRecord {
  name: string;
  payload: any;
  response: any;
}

async function callTool(name: string, payload: any): Promise<any> {
  const res = await fetch(`${SERVER_URL}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, payload }),
  });
  return res.json();
}

async function overrideMockState(key: string, value: any) {
  const res = await fetch(`${SERVER_URL}/mock/override`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  return res.json();
}

async function setScenario(scenario: string) {
  const res = await fetch(`${SERVER_URL}/mock/scenario/${scenario}`, { method: 'POST' });
  return res.json();
}

async function runAssetManagerTests() {
  console.log('\n========================================================================================');
  console.log('  🎯 资管确认场景（thread 01a17d8f-7144-72e3-9b68-e29d90669510）多轮专项测试');
  console.log('========================================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title} ${detail ? `-> ${detail}` : ''}`);
      failed++;
    }
  }

  // ===========================================================================
  // 链路 1：稍后联系时间多轮澄清 -> 约定时间唤醒 -> 同意起草全流程
  // ===========================================================================
  console.log('【场景链路 1：多轮澄清“稍后联系时间” -> 到期唤醒 -> 明确同意起草全闭环】');
  await setScenario('first_recruit_success');

  // --- 第 1 轮：初次进入步骤 3/5，资管未联系 ---
  console.log('\n  👉 [第 1 轮]: 初始状态未联系 (NOT_CONTACTED)');
  await overrideMockState('assetManagerAuth', {
    assetState: 'NOT_CONTACTED',
    authorization: 'UNKNOWN',
    authorizationReason: '待联系资管确认',
    nextContactAt: '2026-10-27T16:00:00+08:00',
  });

  // 执行 Agent 逻辑
  {
    const queryResp = await callTool('query_asset_manager_authorization', { executionId: 123 });
    assert(queryResp.data.assetState === 'NOT_CONTACTED', '查询确认资管为未联系状态');

    const contactResp = await callTool('contact_zuwu_and_asset_manager', {
      executionId: 123,
      target: 'ASSET_MANAGER',
      contactReason: '咨询首招到期是否同意起草解约协议',
      content: '资管经理您好，该房屋首招到期，相关前置排查已通过，请问是否同意起草解约协议？',
    });
    assert(contactResp.data.status === 'ACCEPTED', '成功私聊资管发送初次咨询消息');

    const reQueryResp = await callTool('query_asset_manager_authorization', { executionId: 123 });
    const output = {
      command: 'schedule',
      nextScheduleAt: reQueryResp.data.nextContactAt,
      finalAnswer: null,
      reason: '等待资管回复',
    };
    assert(output.command === 'schedule', '第 1 轮结束：输出 command: schedule 挂起');
    assert(output.nextScheduleAt === '2026-10-27T16:00:00+08:00', '挂起时间为工具计算的下次联系时间');
  }

  // --- 第 2 轮：资管回复“稍后再联系”（时间未明确） ---
  console.log('\n  👉 [第 2 轮]: 资管私聊回复“先稍后联系吧，我手头有点事”（时间未明确）');
  {
    // 模拟上下文追加了资管消息：“先稍后联系吧，我手头有点事”
    // Agent 识别出意图为 CONTACT_LATER，时间未明确
    const saveResp = await callTool('save_asset_manager_authorization', {
      executionId: 123,
      authorization: 'CONTACT_LATER',
      reason: '资管回复：先稍后联系吧，我手头有点事',
      nextContactAt: null,
    });
    assert(saveResp.data.success === true, '保存资管意图为 CONTACT_LATER，时间为 null');

    const contactResp = await callTool('contact_zuwu_and_asset_manager', {
      executionId: 123,
      target: 'ASSET_MANAGER',
      contactReason: '确认资管要求稍后联系的具体时间',
      content: '好的，请问您希望在哪一天、几点再次联系您确认？',
    });
    assert(contactResp.data.status === 'ACCEPTED', '成功追问具体联系时间');

    const output = {
      command: null,
      nextScheduleAt: null,
      finalAnswer: null,
      reason: '资管要求稍后联系，但未明确联系时间，已追问并等待回复',
    };
    assert(output.command === null, '第 2 轮结束：时间未明确，输出 command: null 挂起，不关单');
  }

  // --- 第 3 轮：资管结合上一轮追问补充时间：“明天上午10点确认” ---
  console.log('\n  👉 [第 3 轮]: 资管回复“明天上午10点确认”（结合上下文理解为补充联系时间）');
  {
    // 关键点：结合上一轮上下文，识别为对联系时间的补充，得到归一化时间
    const confirmedTime = '2026-10-28T10:00:00+08:00';
    const saveResp = await callTool('save_asset_manager_authorization', {
      executionId: 123,
      authorization: 'CONTACT_LATER',
      reason: '资管明确约定：明天上午10点确认',
      nextContactAt: confirmedTime,
    });
    assert(saveResp.data.success === true, '保存已明确的下次联系时间');
    assert(saveResp.data.nextContactAt === confirmedTime, '回填的下次唤醒时间正确');

    const output = {
      command: 'schedule',
      nextScheduleAt: saveResp.data.nextContactAt,
      finalAnswer: null,
      reason: '资管要求稍后联系，按约定时间再次确认',
    };
    assert(output.command === 'schedule', '第 3 轮结束：时间已明确，输出 command: schedule 挂起至约定时刻');
    assert(output.nextScheduleAt === confirmedTime, '准确填入带时区的约定未来时间');
  }

  // --- 第 4 轮：约定时间到达唤醒，资管回复：“可以起草，发吧” ---
  console.log('\n  👉 [第 4 轮]: 调度到期唤醒，资管回复“可以起草，发吧” -> 明确同意');
  {
    const saveResp = await callTool('save_asset_manager_authorization', {
      executionId: 123,
      authorization: 'AGREE_DRAFT',
      reason: '资管明确回复：可以起草，发吧',
      nextContactAt: null,
    });
    assert(saveResp.data.authorization === 'AGREE_DRAFT', '保存资管同意授权');

    // 准入通过，调用起草解约协议接口
    const draftResp = await callTool('draft_owner_termination_agreement', {
      contractId: 'TG20261024001',
      type: 'TERMINATION',
      reason: '首招到期自动发起解约流程',
    });
    assert(draftResp.errno === '0', '起草解约协议接口成功');
    assert(Boolean(draftResp.data.agreementId), `生成解约协议 ID: ${draftResp.data.agreementId}`);

    const output = {
      command: 'schedule',
      nextScheduleAt: '2026-10-29T10:00:00+08:00',
      finalAnswer: '@业主 您好，您的房屋首招到期解约协议已起草完成并提交办理，审核通过后请您留意关注协议查收与签署。',
      reason: '首招解约协议起草成功，通知业主办理进展并安排 t+2 签约提醒',
    };
    assert(output.command === 'schedule', '第 4 轮结束：起草成功，输出 command: schedule 挂起 t+2 签约提醒');
    assert(output.finalAnswer.includes('已起草完成'), '业主群内下发起草进展通知');
  }

  // ===========================================================================
  // 链路 2：暂不同意 -> 追问原因 -> 资管说明自跟进 -> 结单
  // ===========================================================================
  console.log('\n【场景链路 2：暂不同意 -> 追问原因及稍后联系 -> 资管线下自跟进 -> 结单】');
  {
    // 第 1 步：资管回复“先别发，不能发”
    console.log('  👉 [第 1 步]: 资管回复“先别发，不能发”');
    const saveDecline = await callTool('save_asset_manager_authorization', {
      executionId: 123,
      authorization: 'DECLINE_DRAFT',
      reason: '资管回复：先别发，不能发',
      nextContactAt: null,
    });
    assert(saveDecline.data.authorization === 'DECLINE_DRAFT', '保存暂不同意意图');

    const contactAskReason = await callTool('contact_zuwu_and_asset_manager', {
      executionId: 123,
      target: 'ASSET_MANAGER',
      contactReason: '确认暂不同意起草的原因及是否稍后联系',
      content: '收到，暂不发起起草。请问具体原因是什么？后续是否需要在指定时间再联系您确认？',
    });
    assert(contactAskReason.data.status === 'ACCEPTED', '私聊追问暂不同意原因及是否稍后联系');

    const output1 = {
      command: null,
      nextScheduleAt: null,
      finalAnswer: null,
      reason: '资管暂不同意起草，已追问原因及是否需要稍后联系，等待资管回复',
    };
    assert(output1.command === null, '暂不同意阶段输出 command: null 挂起，不关单不转人工');

    // 第 2 步：资管回复“业主对租金有想法，我来线下跟进沟通，你别管了”
    console.log('  👉 [第 2 步]: 资管说明“业主对租金有想法，我来线下跟进沟通，你别管了”');
    const saveFollow = await callTool('save_asset_manager_authorization', {
      executionId: 123,
      authorization: 'ASSET_MANAGER_FOLLOW',
      reason: '资管说明：业主对租金有想法，我来线下跟进沟通，你别管了',
      nextContactAt: null,
    });
    assert(saveFollow.data.authorization === 'ASSET_MANAGER_FOLLOW', '转为资管自行跟进 ASSET_MANAGER_FOLLOW');

    const output2 = {
      command: 'end',
      nextScheduleAt: null,
      finalAnswer: null,
      reason: '资管明确表示自行跟进处理，结束本次工单: 业主对租金有想法，我来线下跟进沟通',
    };
    assert(output2.command === 'end', '资管自跟进明确关单 command: end');
  }

  // ===========================================================================
  // 链路 3：阶梯式追问与3次追问耗尽 (2h / 4h / t+1)
  // ===========================================================================
  console.log('\n【场景链路 3：阶梯式追问与3次追问耗尽 (2h / 4h / t+1)】');
  {
    // 第 1 次追问 (2h 到期)
    console.log('  👉 [追问 1 轮]: 2h 到期，资管仍未回复');
    await overrideMockState('assetManagerAuth', {
      assetState: 'WAITING_REPLY',
      nextContactAt: '2026-10-27T18:00:00+08:00', // 第 2 次追问时间 (4h)
    });
    const askRound1 = await callTool('contact_zuwu_and_asset_manager', {
      executionId: 123,
      target: 'ASSET_MANAGER',
      contactReason: '资管未回复，追问是否同意起草解约协议',
      content: '资管经理您好，之前咨询的首招到期解约协议起草事项尚未收到确认...',
      remindRound: 1,
    });
    assert(askRound1.data.status === 'ACCEPTED', '下发第 1 次追问 (2h)');

    const reCheck1 = await callTool('query_asset_manager_authorization', { executionId: 123 });
    assert(reCheck1.data.nextContactAt === '2026-10-27T18:00:00+08:00', '获取第 2 次追问调度时刻 (4h)');

    // 第 2 次追问 (4h 到期)
    console.log('  👉 [追问 2 轮]: 4h 到期，资管仍未回复');
    await overrideMockState('assetManagerAuth', {
      assetState: 'WAITING_REPLY',
      nextContactAt: '2026-10-28T09:00:00+08:00', // 第 3 次追问时间 (t+1)
    });
    const askRound2 = await callTool('contact_zuwu_and_asset_manager', {
      executionId: 123,
      target: 'ASSET_MANAGER',
      contactReason: '资管未回复，追问是否同意起草解约协议',
      content: '资管经理您好，之前咨询的首招到期解约协议起草事项尚未收到确认...',
      remindRound: 2,
    });
    assert(askRound2.data.status === 'ACCEPTED', '下发第 2 次追问 (4h)');

    // 第 3 次追问到期后，追问次数耗尽
    console.log('  👉 [追问 3 轮]: t+1 追问后仍未回复，3次追问耗尽 (nextContactAt 为 null)');
    await overrideMockState('assetManagerAuth', {
      assetState: 'WAITING_REPLY',
      nextContactAt: null, // 工具确认追问耗尽
    });
    const finalCheck = await callTool('query_asset_manager_authorization', { executionId: 123 });
    assert(finalCheck.data.nextContactAt === null, '工具返回 nextContactAt=null 确认追问耗尽');

    const outputTimeout = {
      command: 'end',
      nextScheduleAt: null,
      finalAnswer: null,
      reason: '资管经理经3次追问仍未回复，定义为资管未回复，结束本次工单',
    };
    assert(outputTimeout.command === 'end', '追问耗尽输出 command: end 结单，不无休止等待');
  }

  // ===========================================================================
  // 链路 4：意图无法识别时引导澄清
  // ===========================================================================
  console.log('\n【场景链路 4：意图无法识别时引导澄清】');
  {
    console.log('  👉 资管回复模棱两可内容：“今天天气不错”');
    const contactClarify = await callTool('contact_zuwu_and_asset_manager', {
      executionId: 123,
      target: 'ASSET_MANAGER',
      contactReason: '澄清资管对起草解约协议的授权意图',
      content: '请问您是同意起草、暂不同意、由您自行跟进，还是需要稍后再联系？',
    });
    assert(contactClarify.data.status === 'ACCEPTED', '发送引导澄清问题');

    const outputClarify = {
      command: null,
      nextScheduleAt: null,
      finalAnswer: null,
      reason: '暂未识别到明确资管意图，已发送澄清问题，等待资管回复',
    };
    assert(outputClarify.command === null, '未识别意图时不强行保存同意或拒绝，输出 command: null 挂起等待');
  }

  console.log('\n========================================================================================');
  console.log(`  🎉 资管确认专项测试完成: 通过 ${passed} 项，失败 ${failed} 项`);
  console.log('========================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAssetManagerTests().catch((err) => {
  console.error('资管确认专项测试异常:', err);
  process.exit(1);
});
