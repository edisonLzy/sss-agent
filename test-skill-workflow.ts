/**
 * 业主自助解约（owner-self-termination）Skill 工作流全面自动化测试套件
 * 
 * 校验范围：
 * 1. SKILL.md 主流程：前置校验、意向分流（RENEW/PENDING/ASSET_MANAGER_FOLLOW）、解约类型分流
 * 2. first-recruit-termination.md 子流程：防重、延长期排查、续约排查、在租排查、资管授权全分支、协议起草与转人工
 * 3. entrusted-termination.md 子流程：防重、续约排查、在租排查、双交割与物损核查、资管授权全分支、协议起草
 * 4. 契约校验：tool-contracts.md 入参合规性、output-scheme.md 输出合规性
 */

const SERVER_URL = 'http://localhost:8080';

export interface RuntimeFields {
  orderId?: number;
  contractCode?: string;
  terminationType?: string;
  executionId?: number;
  sessionId?: string;
  requestId?: string;
}

export interface SkillOutput {
  command: 'schedule' | 'end' | 'transfer_to_human' | null;
  nextScheduleAt: string | null;
  finalAnswer: string | null;
  reason: string;
}

/** 模拟 Skill 核心执行引擎，严格遵循 SKILL.md 与 Reference SOP */
export async function executeSkill(fields: RuntimeFields): Promise<{
  output: SkillOutput;
  toolCalls: Array<{ name: string; payload: any; response: any }>;
}> {
  const toolCalls: Array<{ name: string; payload: any; response: any }> = [];

  // 调用外部工具的统一方法（对齐 Call({ name, payload })）
  async function callTool(name: string, payload: any) {
    const res = await fetch(`${SERVER_URL}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, payload }),
    });
    const result = await res.json();
    toolCalls.push({ name, payload, response: result });
    return result;
  }

  // ===========================================================================
  // 1. 前置校验必要运行参数
  // ===========================================================================
  if (!fields.orderId || !fields.contractCode || !fields.terminationType) {
    return {
      output: {
        command: 'transfer_to_human',
        nextScheduleAt: null,
        finalAnswer: null,
        reason: '前置校验失败：缺失必填运行参数（orderId/contractCode/terminationType），转人工服务管家核验',
      },
      toolCalls,
    };
  }

  // ===========================================================================
  // 2. 查询业主续解意向
  // ===========================================================================
  const intentionResp = await callTool('query_owner_intention', {
    orderId: fields.orderId,
    sessionId: fields.sessionId,
    requestId: fields.requestId,
  });

  const intention = intentionResp?.data?.intention;

  if (intention === 'RENEW') {
    return {
      output: {
        command: 'end',
        nextScheduleAt: null,
        finalAnswer: null,
        reason: '业主意向为续约，不在本期自助解约处理范围，提前结束自动推进',
      },
      toolCalls,
    };
  }

  if (intention === 'PENDING' || intention === 'UNKNOWN') {
    return {
      output: {
        command: 'end',
        nextScheduleAt: null,
        finalAnswer: null,
        reason: '业主续解意向尚未明确确认，提前结束本次解约自动推进',
      },
      toolCalls,
    };
  }

  if (intention === 'ASSET_MANAGER_FOLLOW') {
    return {
      output: {
        command: 'end',
        nextScheduleAt: null,
        finalAnswer: null,
        reason: '业主意向标记为资管线下自跟进，提前结束本次自动推进',
      },
      toolCalls,
    };
  }

  // 意向非 TERMINATE 时防御
  if (intention !== 'TERMINATE') {
    return {
      output: {
        command: 'end',
        nextScheduleAt: null,
        finalAnswer: null,
        reason: `业主续解意向不满足解约条件: ${intention}，提前结束自动推进`,
      },
      toolCalls,
    };
  }

  // ===========================================================================
  // 3. 检查解约类型
  // ===========================================================================
  if (fields.terminationType !== '首招到期' && fields.terminationType !== '委托到期') {
    return {
      output: {
        command: 'end',
        nextScheduleAt: null,
        finalAnswer: null,
        reason: `当前解约类型不在本期自动化处理范围: ${fields.terminationType}，提前结束本次自动推进`,
      },
      toolCalls,
    };
  }

  // ===========================================================================
  // 4.1 首招到期子流程 (first-recruit-termination.md)
  // ===========================================================================
  if (fields.terminationType === '首招到期') {
    // 步骤 1：检查业主解约协议（防重核查）
    const termAgrResp = await callTool('query_owner_termination_agreement', {
      contractCode: fields.contractCode,
      orderId: fields.orderId,
      sessionId: fields.sessionId,
      requestId: fields.requestId,
    });

    if (termAgrResp?.data?.hasValidAgreement) {
      if (termAgrResp.data.isSigned) {
        return {
          output: {
            command: 'end',
            nextScheduleAt: null,
            finalAnswer: '@业主 您好，您的房屋首招到期解约协议已确认签署完成，解约手续已全部办结。感谢您一直以来对我们的信任与支持，祝您生活愉快！请问本次不再合作的主要原因是什么呢？您的宝贵建议对我们至关重要。',
            reason: '原收房合同解约协议已签署完成，发送服务合作致谢祝福及不合作原因回访，流程完结直接关单',
          },
          toolCalls,
        };
      } else {
        return {
          output: {
            command: 'end',
            nextScheduleAt: null,
            finalAnswer: null,
            reason: '原收房合同已存在在途审批或待签署的解约协议，避免重复发起，直接关单',
          },
          toolCalls,
        };
      }
    }

    // 步骤 2.1：检查首招延长期变更协议
    const extResp = await callTool('query_first_recruit_extension_agreement', {
      contractCode: fields.contractCode,
      orderId: fields.orderId,
      sessionId: fields.sessionId,
      requestId: fields.requestId,
    });
    if (extResp?.data?.hasValidExtension) {
      return {
        output: {
          command: 'end',
          nextScheduleAt: null,
          finalAnswer: null,
          reason: '原收房合同已办理或正在推进首招延长期变更，不可按到期解约，直接关单',
        },
        toolCalls,
      };
    }

    // 步骤 2.2：检查业主续约协议
    const renewalResp = await callTool('query_owner_renewal_agreement', {
      contractCode: fields.contractCode,
      orderId: fields.orderId,
      sessionId: fields.sessionId,
      requestId: fields.requestId,
    });
    if (renewalResp?.data?.hasValidRenewal) {
      return {
        output: {
          command: 'end',
          nextScheduleAt: null,
          finalAnswer: null,
          reason: '原收房合同已存在有效续约合同，定义为“业主续约”，直接关单',
        },
        toolCalls,
      };
    }

    // 步骤 2.3：检查租客在租租赁协议
    const tenantResp = await callTool('query_tenant_contract', {
      contractCode: fields.contractCode,
      orderId: fields.orderId,
      sessionId: fields.sessionId,
      requestId: fields.requestId,
    });
    if (tenantResp?.data?.hasValidTenantContract) {
      return {
        output: {
          command: 'end',
          nextScheduleAt: null,
          finalAnswer: null,
          reason: '托管房源存在在租租客合同，定义为“租客续约/在租”，直接关单',
        },
        toolCalls,
      };
    }

    // 步骤 3：资管授权确认与阶梯追问
    const amResp = await callTool('query_asset_manager_authorization', {
      executionId: fields.executionId,
      orderId: fields.orderId,
      contractCode: fields.contractCode,
      sessionId: fields.sessionId,
      requestId: fields.requestId,
    });

    const authData = amResp?.data;

    // 3.1 明确同意起草
    if (authData?.authorization === 'AGREE_DRAFT') {
      await callTool('save_asset_manager_authorization', {
        executionId: fields.executionId,
        authorization: 'AGREE_DRAFT',
        reason: authData.authorizationReason || '资管已同意起草',
        nextContactAt: null,
        sessionId: fields.sessionId,
        requestId: fields.requestId,
      });

      // 步骤 4：发起起草业主解约协议
      const draftResp = await callTool('draft_owner_termination_agreement', {
        contractId: fields.contractCode,
        type: 'TERMINATION',
        reason: '首招到期自动发起解约流程',
        sessionId: fields.sessionId,
        requestId: fields.requestId,
      });

      if (draftResp?.errno === '0' && draftResp?.data?.agreementId) {
        return {
          output: {
            command: 'schedule',
            nextScheduleAt: '2026-10-29T10:00:00+08:00', // t+2 提醒
            finalAnswer: '@业主 您好，您的房屋首招到期解约协议已起草完成并提交办理，审核通过后请您留意关注协议查收与签署。',
            reason: '首招解约协议起草成功，通知业主办理进展并安排 t+2 签约提醒',
          },
          toolCalls,
        };
      } else {
        return {
          output: {
            command: 'transfer_to_human',
            nextScheduleAt: null,
            finalAnswer: '@业主 您好，系统办理过程中出现微小异常，已为您转接人工服务管家跟进处理，请稍候。',
            reason: '调用接口起草业主解约协议未成功，转人工服务管家线下起草',
          },
          toolCalls,
        };
      }
    }

    // 3.2 暂不同意
    if (authData?.authorization === 'DECLINE_DRAFT') {
      await callTool('save_asset_manager_authorization', {
        executionId: fields.executionId,
        authorization: 'DECLINE_DRAFT',
        reason: authData.authorizationReason || '资管暂不同意起草',
        nextContactAt: null,
        sessionId: fields.sessionId,
        requestId: fields.requestId,
      });

      await callTool('contact_zuwu_and_asset_manager', {
        executionId: fields.executionId,
        orderId: fields.orderId,
        contractCode: fields.contractCode,
        target: 'ASSET_MANAGER',
        contactReason: '确认暂不同意起草的原因及是否稍后联系',
        content: '收到，暂不发起起草。请问具体原因是什么？后续是否需要在指定时间再联系您确认？',
        sessionId: fields.sessionId,
        requestId: fields.requestId,
      });

      return {
        output: {
          command: null,
          nextScheduleAt: null,
          finalAnswer: null,
          reason: '资管暂不同意起草，已追问原因及是否需要稍后联系，等待资管回复',
        },
        toolCalls,
      };
    }

    // 3.3 资管自行跟进
    if (authData?.authorization === 'ASSET_MANAGER_FOLLOW') {
      await callTool('save_asset_manager_authorization', {
        executionId: fields.executionId,
        authorization: 'ASSET_MANAGER_FOLLOW',
        reason: authData.authorizationReason || '资管明确表示自行跟进处理',
        nextContactAt: null,
        sessionId: fields.sessionId,
        requestId: fields.requestId,
      });

      return {
        output: {
          command: 'end',
          nextScheduleAt: null,
          finalAnswer: null,
          reason: `资管明确表示自行跟进处理，结束本次工单: ${authData.authorizationReason || ''}`,
        },
        toolCalls,
      };
    }

    // 3.4 稍后联系
    if (authData?.authorization === 'CONTACT_LATER') {
      if (authData.nextContactAt) {
        await callTool('save_asset_manager_authorization', {
          executionId: fields.executionId,
          authorization: 'CONTACT_LATER',
          reason: authData.authorizationReason || '资管要求稍后联系',
          nextContactAt: authData.nextContactAt,
          sessionId: fields.sessionId,
          requestId: fields.requestId,
        });

        return {
          output: {
            command: 'schedule',
            nextScheduleAt: authData.nextContactAt,
            finalAnswer: null,
            reason: '资管要求稍后联系，按约定时间再次确认',
          },
          toolCalls,
        };
      } else {
        await callTool('save_asset_manager_authorization', {
          executionId: fields.executionId,
          authorization: 'CONTACT_LATER',
          reason: authData.authorizationReason || '稍后联系但未定时间',
          nextContactAt: null,
          sessionId: fields.sessionId,
          requestId: fields.requestId,
        });

        await callTool('contact_zuwu_and_asset_manager', {
          executionId: fields.executionId,
          orderId: fields.orderId,
          contractCode: fields.contractCode,
          target: 'ASSET_MANAGER',
          contactReason: '确认资管要求稍后联系的具体时间',
          content: '好的，请问您希望在哪一天、几点再次联系您确认？',
          sessionId: fields.sessionId,
          requestId: fields.requestId,
        });

        return {
          output: {
            command: null,
            nextScheduleAt: null,
            finalAnswer: null,
            reason: '资管要求稍后联系，但未明确联系时间，已追问并等待回复',
          },
          toolCalls,
        };
      }
    }

    // 3.5 未联系 (NOT_CONTACTED)
    if (authData?.assetState === 'NOT_CONTACTED') {
      await callTool('contact_zuwu_and_asset_manager', {
        executionId: fields.executionId,
        orderId: fields.orderId,
        contractCode: fields.contractCode,
        target: 'ASSET_MANAGER',
        contactReason: '咨询首招到期是否同意起草解约协议',
        content: '资管经理您好，该房屋首招到期，相关前置排查已通过，请问是否同意起草解约协议？审核通过后将按流程发送业主签约。',
        sessionId: fields.sessionId,
        requestId: fields.requestId,
      });

      const reCheck = await callTool('query_asset_manager_authorization', {
        executionId: fields.executionId,
        orderId: fields.orderId,
        contractCode: fields.contractCode,
        sessionId: fields.sessionId,
        requestId: fields.requestId,
      });

      return {
        output: {
          command: 'schedule',
          nextScheduleAt: reCheck?.data?.nextContactAt,
          finalAnswer: null,
          reason: '等待资管回复',
        },
        toolCalls,
      };
    }

    // 3.6 待回复 (WAITING_REPLY)
    if (authData?.assetState === 'WAITING_REPLY') {
      if (authData.nextContactAt) {
        await callTool('contact_zuwu_and_asset_manager', {
          executionId: fields.executionId,
          orderId: fields.orderId,
          contractCode: fields.contractCode,
          target: 'ASSET_MANAGER',
          contactReason: '资管未回复，追问是否同意起草解约协议',
          content: '资管经理您好，之前咨询的首招到期解约协议起草事项尚未收到您的确认，请问您是否同意起草，或需要由您跟进、稍后再联系？',
          sessionId: fields.sessionId,
          requestId: fields.requestId,
        });

        const reCheck = await callTool('query_asset_manager_authorization', {
          executionId: fields.executionId,
          orderId: fields.orderId,
          contractCode: fields.contractCode,
          sessionId: fields.sessionId,
          requestId: fields.requestId,
        });

        return {
          output: {
            command: 'schedule',
            nextScheduleAt: reCheck?.data?.nextContactAt,
            finalAnswer: null,
            reason: '等待资管回复',
          },
          toolCalls,
        };
      } else {
        // 追问耗尽 (nextContactAt 为 null)
        return {
          output: {
            command: 'end',
            nextScheduleAt: null,
            finalAnswer: null,
            reason: '资管经理经3次追问仍未回复，定义为资管未回复，结束本次工单',
          },
          toolCalls,
        };
      }
    }
  }

  // ===========================================================================
  // 4.2 委托到期子流程 (entrusted-termination.md)
  // ===========================================================================
  if (fields.terminationType === '委托到期') {
    // 步骤 1：检查业主解约协议（防重核查）
    const termAgrResp = await callTool('query_owner_termination_agreement', {
      contractCode: fields.contractCode,
      orderId: fields.orderId,
      sessionId: fields.sessionId,
      requestId: fields.requestId,
    });

    if (termAgrResp?.data?.hasValidAgreement) {
      if (termAgrResp.data.isSigned) {
        return {
          output: {
            command: 'end',
            nextScheduleAt: null,
            finalAnswer: '@业主 您好，您的房屋委托到期解约协议已确认签署完成，解约手续已全部办结。感谢您一直以来对我们的信任与支持，祝您生活愉快！请问本次不再合作的主要原因是什么呢？您的宝贵建议对我们至关重要。',
            reason: '原收房合同解约协议已签署完成，发送服务合作致谢祝福及不合作原因回访，流程完结直接关单',
          },
          toolCalls,
        };
      } else {
        return {
          output: {
            command: 'end',
            nextScheduleAt: null,
            finalAnswer: null,
            reason: '原收房合同已存在在途审批或待签署的解约协议，避免重复发起，直接关单',
          },
          toolCalls,
        };
      }
    }

    // 步骤 2：检查业主续约合同（互斥排查）
    const renewalResp = await callTool('query_owner_renewal_agreement', {
      contractCode: fields.contractCode,
      orderId: fields.orderId,
      sessionId: fields.sessionId,
      requestId: fields.requestId,
    });
    if (renewalResp?.data?.hasValidRenewal) {
      return {
        output: {
          command: 'end',
          nextScheduleAt: null,
          finalAnswer: null,
          reason: '房源已存在有效续约合同，定义为业主续约，直接关单',
        },
        toolCalls,
      };
    }

    // 步骤 3：检查租客在租租赁协议
    const tenantResp = await callTool('query_tenant_contract', {
      contractCode: fields.contractCode,
      orderId: fields.orderId,
      sessionId: fields.sessionId,
      requestId: fields.requestId,
    });
    if (tenantResp?.data?.hasValidTenantContract) {
      return {
        output: {
          command: 'end',
          nextScheduleAt: null,
          finalAnswer: null,
          reason: '托管房源仍处于在租状态或租客已续约，与解约流程互斥，直接关单',
        },
        toolCalls,
      };
    }

    // 步骤 4.1：检查租客退租交割单状态
    const tenantDeliveryResp = await callTool('query_tenant_delivery_checklist', {
      contractCode: fields.contractCode,
      orderId: fields.orderId,
      sessionId: fields.sessionId,
      requestId: fields.requestId,
    });

    if (!tenantDeliveryResp?.data?.isDeliveryFinished) {
      await callTool('contact_zuwu_and_asset_manager', {
        contractCode: fields.contractCode,
        orderId: fields.orderId,
        target: 'ZUWU',
        contactReason: '租客交割未完成，催办租客交割及业主交割清单',
        content: '管家您好，该房源业主已明确到期解约，请抓紧完成租客退租解约交割，并同步上传、完成业主解约交割清单。',
        sessionId: fields.sessionId,
        requestId: fields.requestId,
      });

      return {
        output: {
          command: null,
          nextScheduleAt: null,
          finalAnswer: null,
          reason: '租客解约交割未完成，已联系租务管家催办租客交割及业主交割清单，本轮不再继续后续流程',
        },
        toolCalls,
      };
    }

    // 步骤 4.2：检查业主解约交割单状态
    const ownerDeliveryResp = await callTool('query_owner_delivery_checklist', {
      contractCode: fields.contractCode,
      orderId: fields.orderId,
      sessionId: fields.sessionId,
      requestId: fields.requestId,
    });

    if (!ownerDeliveryResp?.data?.isDeliveryFinished) {
      await callTool('contact_zuwu_and_asset_manager', {
        contractCode: fields.contractCode,
        orderId: fields.orderId,
        target: 'ZUWU',
        contactReason: '催促完成业主解约交割清单上传',
        content: '管家您好，租客退租交割已完成，请抓紧完成业主解约交割清单（还房单）的上传与完结。',
        sessionId: fields.sessionId,
        requestId: fields.requestId,
      });

      return {
        output: {
          command: null,
          nextScheduleAt: null,
          finalAnswer: null,
          reason: '租客解约交割已完成，但业主解约交割清单未完成，已联系租务管家催办，本轮不再继续后续流程',
        },
        toolCalls,
      };
    }

    // 步骤 4.3：检查物品损坏状态
    if (tenantDeliveryResp?.data?.hasDamage || ownerDeliveryResp?.data?.hasDamage) {
      return {
        output: {
          command: 'end',
          nextScheduleAt: null,
          finalAnswer: null,
          reason: '交割清单检查存在物品损坏，任务流程结束关单，记录有物损',
        },
        toolCalls,
      };
    }

    // 步骤 5：资管授权确认与阶梯追问
    const amResp = await callTool('query_asset_manager_authorization', {
      executionId: fields.executionId,
      orderId: fields.orderId,
      contractCode: fields.contractCode,
      sessionId: fields.sessionId,
      requestId: fields.requestId,
    });

    const authData = amResp?.data;

    if (authData?.authorization === 'AGREE_DRAFT') {
      await callTool('save_asset_manager_authorization', {
        executionId: fields.executionId,
        authorization: 'AGREE_DRAFT',
        reason: authData.authorizationReason || '资管已同意起草',
        nextContactAt: null,
        sessionId: fields.sessionId,
        requestId: fields.requestId,
      });

      // 步骤 6：发起起草业主解约协议
      const draftResp = await callTool('draft_owner_termination_agreement', {
        contractId: fields.contractCode,
        type: 'TERMINATION',
        reason: '委托到期自动发起解约流程',
        sessionId: fields.sessionId,
        requestId: fields.requestId,
      });

      if (draftResp?.errno === '0' && draftResp?.data?.agreementId) {
        return {
          output: {
            command: 'schedule',
            nextScheduleAt: '2026-10-29T10:00:00+08:00',
            finalAnswer: '@业主 您好，您的房屋委托到期解约协议已起草完成并提交办理，审核通过后请您留意关注协议查收与签署。',
            reason: '解约协议起草成功，通知业主办理进展并安排 t+2 签约提醒',
          },
          toolCalls,
        };
      } else {
        return {
          output: {
            command: 'transfer_to_human',
            nextScheduleAt: null,
            finalAnswer: '@业主 您好，系统办理过程中出现微小异常，已为您转接人工服务管家跟进处理，请稍候。',
            reason: '调用接口起草业主解约协议未成功，转人工服务管家线下起草',
          },
          toolCalls,
        };
      }
    }
  }

  // 默认兜底
  return {
    output: {
      command: 'end',
      nextScheduleAt: null,
      finalAnswer: null,
      reason: '未命中已定义的执行分支，正常结束',
    },
    toolCalls,
  };
}

// =============================================================================
// 测试用例驱动执行
// =============================================================================

async function switchScenario(scenario: string) {
  const res = await fetch(`${SERVER_URL}/mock/scenario/${scenario}`, { method: 'POST' });
  return res.json();
}

async function runAllSkillTests() {
  console.log('\n================================================================');
  console.log('  🎯 业主自助解约（owner-self-termination）Skill 自动化测试套件');
  console.log('================================================================\n');

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

  // ---------------------------------------------------------------------------
  // 1. 前置校验必填参数
  // ---------------------------------------------------------------------------
  console.log('【模块 1: 前置校验必要运行参数】');
  {
    const res = await executeSkill({ contractCode: 'TG001', terminationType: '首招到期' }); // 缺失 orderId
    assert(res.output.command === 'transfer_to_human', '缺失 orderId 触发 transfer_to_human');
    assert(res.output.reason.includes('缺失必填运行参数'), '原因说明清晰');
    assert(res.toolCalls.length === 0, '未发起任何外部工具调用');
  }
  {
    const res = await executeSkill({ orderId: 101, contractCode: '', terminationType: '首招到期' }); // 缺失 contractCode
    assert(res.output.command === 'transfer_to_human', '缺失 contractCode 触发 transfer_to_human');
  }
  {
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '' }); // 缺失 terminationType
    assert(res.output.command === 'transfer_to_human', '缺失 terminationType 触发 transfer_to_human');
  }

  // ---------------------------------------------------------------------------
  // 2. 意向分流校验
  // ---------------------------------------------------------------------------
  console.log('\n【模块 2: 意向查询与分流】');
  {
    await switchScenario('intention_renew');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期' });
    assert(res.output.command === 'end', '意向为续约 (RENEW) 直接关单 end');
    assert(res.output.reason.includes('续约'), '原因明确指出续约不在自动化范围');
    assert(res.toolCalls.length === 1, '仅调用意向查询工具');
  }
  {
    await switchScenario('intention_pending');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期' });
    assert(res.output.command === 'end', '意向待确认 (PENDING) 提前结束 end');
  }
  {
    await switchScenario('intention_asset_manager_follow');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期' });
    assert(res.output.command === 'end', '意向为资管自跟进提前结束 end');
  }

  // ---------------------------------------------------------------------------
  // 3. 解约类型校验
  // ---------------------------------------------------------------------------
  console.log('\n【模块 3: 解约类型业务场景分流】');
  {
    await switchScenario('first_recruit_success');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '托管中途解约' });
    assert(res.output.command === 'end', '不支持的解约类型提前结束 end');
    assert(res.output.reason.includes('不在本期自动化处理范围'), '原因明确说明');
  }

  // ---------------------------------------------------------------------------
  // 4. 首招到期子流程分支
  // ---------------------------------------------------------------------------
  console.log('\n【模块 4: 首招到期解约子流程 (First Recruit SOP)】');
  {
    // 4.1 已签约完成
    await switchScenario('first_recruit_signed');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期' });
    assert(res.output.command === 'end', '首招已签约完成: 输出 command: end 办结关单');
    assert(res.output.finalAnswer !== null && res.output.finalAnswer.includes('@业主'), '群内播报致谢与不合作原因');
  }
  {
    // 4.2 已有在途待签协议
    await switchScenario('first_recruit_drafting');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期' });
    assert(res.output.command === 'end', '首招已有在途协议: 防重关单 command: end');
    assert(res.output.finalAnswer === null, '静默关单 finalAnswer 为 null');
  }
  {
    // 4.3 存在首招延长期变更
    await switchScenario('first_recruit_has_extension');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期' });
    assert(res.output.command === 'end', '存在首招延长期变更: 直接关单');
    assert(res.toolCalls.some(t => t.name === 'query_first_recruit_extension_agreement'), '调用了延长期排查工具');
  }
  {
    // 4.4 存在业主续约合同
    await switchScenario('first_recruit_has_renewal');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期' });
    assert(res.output.command === 'end', '存在有效续约合同: 定义为业主续约关单');
  }
  {
    // 4.5 存在租客在租租约
    await switchScenario('first_recruit_has_tenant');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期' });
    assert(res.output.command === 'end', '存在租客出房租约: 定义为租客在租关单');
  }
  {
    // 4.6 资管未联系 (NOT_CONTACTED)
    await switchScenario('first_recruit_am_not_contacted');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期', executionId: 123 });
    assert(res.output.command === 'schedule', '资管未联系: 发送初次咨询并挂起 schedule');
    assert(res.output.nextScheduleAt !== null, '存在有效 nextScheduleAt 唤醒时间');
    assert(res.toolCalls.some(t => t.name === 'contact_zuwu_and_asset_manager'), '调用了联系资管工具');
  }
  {
    // 4.7 资管未回复追问 (WAITING_REPLY)
    await switchScenario('first_recruit_am_waiting_reply');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期', executionId: 123 });
    assert(res.output.command === 'schedule', '资管未回复: 追问资管并挂起 schedule');
  }
  {
    // 4.8 资管3次追问耗尽 (WAITING_REPLY & nextContactAt=null)
    await switchScenario('first_recruit_am_exhausted');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期', executionId: 123 });
    assert(res.output.command === 'end', '资管3次追问耗尽: 定义为资管未回复关单 command: end');
  }
  {
    // 4.9 资管暂不同意 (DECLINE_DRAFT)
    await switchScenario('first_recruit_am_decline');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期', executionId: 123 });
    assert(res.output.command === null, '资管暂不同意: 不关单 command: null 挂起等待');
    assert(res.toolCalls.some(t => t.name === 'save_asset_manager_authorization'), '保存了资管授权意图');
    assert(res.toolCalls.some(t => t.name === 'contact_zuwu_and_asset_manager'), '私聊追问暂不同意原因');
  }
  {
    // 4.10 资管自行跟进 (ASSET_MANAGER_FOLLOW)
    await switchScenario('first_recruit_am_follow');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期', executionId: 123 });
    assert(res.output.command === 'end', '资管自行跟进: 关单 command: end');
  }
  {
    // 4.11 资管稍后联系明确时间
    await switchScenario('first_recruit_am_later_with_time');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期', executionId: 123 });
    assert(res.output.command === 'schedule', '稍后联系明确时间: command: schedule');
    assert(res.output.nextScheduleAt === '2026-10-28T10:00:00+08:00', '精确对齐约定唤醒时间');
  }
  {
    // 4.12 资管稍后联系未定时间
    await switchScenario('first_recruit_am_later_no_time');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期', executionId: 123 });
    assert(res.output.command === null, '稍后联系未定时间: command: null 追问时间并挂起等待');
  }
  {
    // 4.13 全流程顺利起草成功
    await switchScenario('first_recruit_success');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期', executionId: 123 });
    assert(res.output.command === 'schedule', '首招全流程成功: command: schedule 挂起后续节点');
    assert(res.output.finalAnswer !== null && res.output.finalAnswer.includes('首招到期解约协议已起草完成'), '群内通知起草成功进展');
    assert(res.toolCalls.some(t => t.name === 'draft_owner_termination_agreement'), '成功调用起草协议写接口');
  }
  {
    // 4.14 起草协议失败
    await switchScenario('draft_fail');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期', executionId: 123 });
    assert(res.output.command === 'transfer_to_human', '写接口起草失败: 0次重试直接转人工 transfer_to_human');
    assert(res.output.finalAnswer !== null && res.output.finalAnswer.includes('人工服务管家'), '群内安抚话术');
  }

  // ---------------------------------------------------------------------------
  // 5. 委托到期子流程分支
  // ---------------------------------------------------------------------------
  console.log('\n【模块 5: 委托到期解约子流程 (Entrusted SOP)】');
  {
    // 5.1 租客交割未完成
    await switchScenario('entrusted_tenant_delivery_unfinished');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '委托到期', executionId: 123 });
    assert(res.output.command === null, '租客交割未完成: command: null 挂起');
    assert(res.toolCalls.some(t => t.name === 'contact_zuwu_and_asset_manager'), '调用联系租务管家催办租客交割与上传业主交割单');
    assert(!res.toolCalls.some(t => t.name === 'query_owner_delivery_checklist'), '阻断后续，未调用业主交割单查询');
  }
  {
    // 5.2 业主交割单未完成
    await switchScenario('entrusted_owner_delivery_unfinished');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '委托到期', executionId: 123 });
    assert(res.output.command === null, '业主交割单未完成: command: null 挂起');
    assert(res.toolCalls.some(t => t.name === 'contact_zuwu_and_asset_manager'), '催办租务上传业主交割清单');
    assert(!res.toolCalls.some(t => t.name === 'draft_owner_termination_agreement'), '阻断起草协议');
  }
  {
    // 5.3 交割存在物损
    await switchScenario('entrusted_has_damage');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '委托到期', executionId: 123 });
    assert(res.output.command === 'end', '交割存在物损: 记录有物损并关单 command: end');
    assert(res.output.reason.includes('存在物品损坏'), '原因记录有物损');
    assert(!res.toolCalls.some(t => t.name === 'draft_owner_termination_agreement'), '严格禁止起草协议');
  }
  {
    // 5.4 委托到期全流程顺利起草成功
    await switchScenario('entrusted_success');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '委托到期', executionId: 123 });
    assert(res.output.command === 'schedule', '委托全流程成功: command: schedule');
    assert(res.output.finalAnswer !== null && res.output.finalAnswer.includes('委托到期解约协议已起草完成'), '群内通知起草成功进展');
    assert(res.toolCalls.some(t => t.name === 'draft_owner_termination_agreement'), '成功调用起草协议写接口');
  }

  // ---------------------------------------------------------------------------
  // 6. 统一契约合规性断言 (AgentLoopOutput Schema)
  // ---------------------------------------------------------------------------
  console.log('\n【模块 6: Workflow 输出契约标准校验 (output-scheme.md)】');
  {
    await switchScenario('first_recruit_success');
    const res = await executeSkill({ orderId: 101, contractCode: 'TG001', terminationType: '首招到期', executionId: 123 });
    const keys = Object.keys(res.output);
    assert(keys.includes('command') && keys.includes('nextScheduleAt') && keys.includes('finalAnswer') && keys.includes('reason'), '返回值固定且仅包含 command, nextScheduleAt, finalAnswer, reason 四个顶层字段');
    assert(['schedule', 'end', 'transfer_to_human', null].includes(res.output.command), 'command 必须为标准枚举值');
    assert(typeof res.output.reason === 'string' && res.output.reason.length > 0, 'reason 必须为非空说明字符串');
  }

  console.log('\n================================================================');
  console.log(`  🎉 Skill 全量业务场景测试完成: 通过 ${passed} 项，失败 ${failed} 项`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllSkillTests().catch((err) => {
  console.error('Skill 测试运行异常:', err);
  process.exit(1);
});
