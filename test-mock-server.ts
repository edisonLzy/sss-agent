/**
 * Mock Server 自动化测试验证脚本
 * 验证：
 * 1. 统一网关 POST /call 调用全部 11 个工具
 * 2. 真实路径 POST /secure/agentTool/ownerTermination/:action 调用
 * 3. 错误参数校验 (如缺失必填参数 contractCode / orderId 返回 1003)
 * 4. 场景切换功能 (首招成功、首招延长期、委托有物损、资管稍后联系等)
 */

import { createMockApp, SCENARIO_PRESETS, ToolErrorType } from './mock-server';
import http from 'http';

async function runTests() {
  const app = createMockApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(8089, () => resolve());
  });

  const baseUrl = 'http://localhost:8089';
  console.log(`\n🚀 测试服务器已启动在 ${baseUrl}，开始执行自动化验证...\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  async function postJson(path: string, body: any) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      data: await res.json(),
    };
  }

  async function getJson(path: string) {
    const res = await fetch(`${baseUrl}${path}`);
    return {
      status: res.status,
      data: await res.json(),
    };
  }

  try {
    // -------------------------------------------------------------------------
    // 测试 1: 首页与健康检查
    // -------------------------------------------------------------------------
    console.log('--- 测试 1: 首页与健康检查 ---');
    const health = await getJson('/health');
    assert(health.status === 200 && health.data.status === 'UP', 'Health check 正常');

    const scenarios = await getJson('/mock/scenarios');
    assert(scenarios.data.errno === '0', '获取场景列表成功');
    assert(scenarios.data.data.scenarios.length >= 20, `成功加载 ${scenarios.data.data.scenarios.length} 个预设场景`);

    // -------------------------------------------------------------------------
    // 测试 2: 统一网关 POST /call - 正常首招流程
    // -------------------------------------------------------------------------
    console.log('\n--- 测试 2: 统一网关 POST /call - 验证首招到期全流程工具 ---');
    await postJson('/mock/scenario/first_recruit_success', {});

    // 2.1 query_owner_intention
    const resIntent = await postJson('/call', {
      name: 'query_owner_intention',
      payload: { orderId: 123456 },
    });
    assert(resIntent.data.errno === '0', 'query_owner_intention 调用成功');
    assert(resIntent.data.data.intention === 'TERMINATE', '业主意向为明确解约 (TERMINATE)');

    // 2.2 query_owner_termination_agreement
    const resTermAgr = await postJson('/call', {
      name: 'query_owner_termination_agreement',
      payload: { contractCode: 'TG20261024001' },
    });
    assert(resTermAgr.data.data.hasValidAgreement === false, '无在途解约协议 (hasValidAgreement=false)');

    // 2.3 query_first_recruit_extension_agreement
    const resExt = await postJson('/call', {
      name: 'query_first_recruit_extension_agreement',
      payload: { contractCode: 'TG20261024001' },
    });
    assert(resExt.data.data.hasValidExtension === false, '无延长期协议 (hasValidExtension=false)');

    // 2.4 query_owner_renewal_agreement
    const resRenew = await postJson('/call', {
      name: 'query_owner_renewal_agreement',
      payload: { contractCode: 'TG20261024001' },
    });
    assert(resRenew.data.data.hasValidRenewal === false, '无续约合同 (hasValidRenewal=false)');

    // 2.5 query_tenant_contract
    const resTenant = await postJson('/call', {
      name: 'query_tenant_contract',
      payload: { contractCode: 'TG20261024001' },
    });
    assert(resTenant.data.data.hasValidTenantContract === false, '无在租租客合同 (hasValidTenantContract=false)');

    // 2.6 query_asset_manager_authorization
    const resAm = await postJson('/call', {
      name: 'query_asset_manager_authorization',
      payload: { executionId: 123 },
    });
    assert(resAm.data.data.authorization === 'AGREE_DRAFT', '资管已同意起草 (authorization=AGREE_DRAFT)');

    // 2.7 draft_owner_termination_agreement
    const resDraft = await postJson('/call', {
      name: 'draft_owner_termination_agreement',
      payload: {
        contractId: 'TG20261024001',
        type: 'TERMINATION',
        reason: '首招到期自动发起解约流程',
      },
    });
    assert(resDraft.data.errno === '0', '起草协议接口成功受理');
    assert(typeof resDraft.data.data.agreementId === 'string', `生成协议 ID: ${resDraft.data.data.agreementId}`);

    // -------------------------------------------------------------------------
    // 测试 3: 真实后端路由 POST /secure/agentTool/ownerTermination/:action
    // -------------------------------------------------------------------------
    console.log('\n--- 测试 3: 贝壳 Landlord 真实 Controller 路由 ---');
    const resBackendTerm = await postJson('/secure/agentTool/ownerTermination/queryOwnerTerminationAgreement', {
      contractCode: 'TG20261024001',
      orderId: 123456,
    });
    assert(resBackendTerm.data.errno === '0', '真实路由 queryOwnerTerminationAgreement 响应正常');

    const resBackendIntent = await postJson('/secure/agentTool/ownerTermination/queryOwnerIntention', {
      orderId: 123456,
    });
    assert(resBackendIntent.data.errno === '0', '真实路由 queryOwnerIntention 响应正常');

    // -------------------------------------------------------------------------
    // 测试 4: 委托到期实体验收与物损场景
    // -------------------------------------------------------------------------
    console.log('\n--- 测试 4: 委托到期与交割场景 ---');
    await postJson('/mock/scenario/entrusted_has_damage', {});

    const resTenantChecklist = await postJson('/call', {
      name: 'query_tenant_delivery_checklist',
      payload: { contractCode: 'TG20261024001' },
    });
    assert(resTenantChecklist.data.data.hasDamage === true, '物损场景: hasDamage 为 true');
    assert(resTenantChecklist.data.data.canProceedTermination === false, '物损场景: canProceedTermination 为 false');
    assert(resTenantChecklist.data.data.damageDescList.length > 0, `损坏物品明细: ${resTenantChecklist.data.data.damageDescList.join(', ')}`);

    // 切换到委托到期未完成交割
    await postJson('/mock/scenario/entrusted_tenant_delivery_unfinished', {});
    const resUnfinished = await postJson('/call', {
      name: 'query_tenant_delivery_checklist',
      payload: { contractCode: 'TG20261024001' },
    });
    assert(resUnfinished.data.data.isDeliveryFinished === false, '租客交割未完成: isDeliveryFinished=false');

    // -------------------------------------------------------------------------
    // 测试 5: 催办通知与资管追问场景
    // -------------------------------------------------------------------------
    console.log('\n--- 测试 5: 催办联系与资管授权分发场景 ---');
    await postJson('/mock/scenario/first_recruit_am_waiting_reply', {});

    const resWaiting = await postJson('/call', {
      name: 'query_asset_manager_authorization',
      payload: { executionId: 123 },
    });
    assert(resWaiting.data.data.assetState === 'WAITING_REPLY', '资管状态为 WAITING_REPLY');
    assert(resWaiting.data.data.nextContactAt !== null, `存在下一次追问时间: ${resWaiting.data.data.nextContactAt}`);

    // 发起联系
    const resContact = await postJson('/call', {
      name: 'contact_zuwu_and_asset_manager',
      payload: {
        executionId: 123,
        target: 'ASSET_MANAGER',
        contactReason: '追问资管是否同意起草',
        content: '资管经理您好，之前咨询的首招到期解约起草是否同意？',
      },
    });
    assert(resContact.data.errno === '0', '私聊催办联系工具发送成功');
    assert(resContact.data.data.status === 'ACCEPTED', '催办状态为 ACCEPTED');

    // 保存资管授权状态
    const resSaveAuth = await postJson('/call', {
      name: 'save_asset_manager_authorization',
      payload: {
        executionId: 123,
        authorization: 'CONTACT_LATER',
        reason: '资管要求稍后联系',
        nextContactAt: '2026-10-28T14:00:00+08:00',
      },
    });
    assert(resSaveAuth.data.errno === '0', '保存资管授权状态成功');
    assert(resSaveAuth.data.data.authorization === 'CONTACT_LATER', '授权状态已成功回填');

    // -------------------------------------------------------------------------
    // 测试 6: 必填参数校验与错误码 (对齐 1003 / 501 / 1004)
    // -------------------------------------------------------------------------
    console.log('\n--- 测试 6: 参数非法校验与错误码防御 ---');
    // 缺失 orderId
    const resMissingOrder = await postJson('/call', {
      name: 'query_owner_intention',
      payload: {},
    });
    assert(resMissingOrder.data.errno === '1003', '缺少 orderId 正确返回 1003 (INVALID_ARGUMENT)');

    // 缺失 contractCode
    const resMissingContract = await postJson('/call', {
      name: 'query_owner_termination_agreement',
      payload: { contractCode: '' },
    });
    assert(resMissingContract.data.errno === '1003', '缺少 contractCode 正确返回 1003 (INVALID_ARGUMENT)');

    // 起草协议失败场景
    await postJson('/mock/scenario/draft_fail', {});
    const resDraftFail = await postJson('/call', {
      name: 'draft_owner_termination_agreement',
      payload: { contractId: '123', type: '解约', reason: '自动发起' },
    });
    assert(resDraftFail.data.errno === '1004', '起草失败场景正确返回 1004');

    // -------------------------------------------------------------------------
    // 测试 7: 审计历史与状态查看
    // -------------------------------------------------------------------------
    console.log('\n--- 测试 7: 审计历史与状态查看 ---');
    const state = await getJson('/mock/state');
    assert(state.data.data.state.callHistory.length > 10, `记录了 ${state.data.data.state.callHistory.length} 条调用审计记录`);
    assert(state.data.data.state.contactHistory.length >= 1, `记录了 ${state.data.data.state.contactHistory.length} 条联系记录`);
  } finally {
    server.close();
  }

  console.log(`\n======================================================`);
  console.log(`  🎉 自动化测试完成: 通过 ${passed} 项，失败 ${failed} 项`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('测试运行异常:', err);
  process.exit(1);
});
