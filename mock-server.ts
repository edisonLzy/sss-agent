/**
 * 业主自助解约（owner-self-termination）Skill Mock Server
 *
 * 对齐后端实现：
 * 1. huiju-private-domain-landlord (OwnerTerminationAgentToolController / OwnerTerminationAgentToolService)
 * 2. agent-router (AgentLoopOutput / BusinessAgent)
 *
 * 提供支持：
 * - 统一网关：POST /call (匹配 Skill 内部 Call({ name, payload }) 约定)
 * - 真实后端接口路径：POST /secure/agentTool/ownerTermination/:action
 * - 直连 Tool 接口：POST /:toolName (同时支持 snake_case 与 camelCase)
 * - 场景管理 API：GET /mock/scenarios, POST /mock/scenario/:name, GET /mock/state, POST /mock/reset
 */

import express, { Request, Response, NextFunction } from 'express';

// =============================================================================
// 1. 类型定义与标准响应结构
// =============================================================================

export interface ResponseResult<T = any> {
  errno: string | number;
  error?: string;
  errmsg?: string;
  data?: T;
}

export enum ToolErrorType {
  AUTH_CONTEXT_MISSING = '1001',
  INVALID_ARGUMENT = '1003',
  BACKEND_FAILED = '1004',
  BUSINESS_BLOCKED = '1007',
  NOT_IMPLEMENTED = '501',
}

export function successResult<T>(data: T): ResponseResult<T> {
  return {
    errno: '0',
    errmsg: 'success',
    error: 'success',
    data,
  };
}

export function errorResult(code: string | ToolErrorType, message: string): ResponseResult<null> {
  return {
    errno: code,
    errmsg: message,
    error: message,
    data: null,
  };
}

// =============================================================================
// 2. Mock 业务状态与预设用例场景
// =============================================================================

export interface MockState {
  // 意向
  intention: {
    intention: 'TERMINATE' | 'RENEW' | 'PENDING' | 'ASSET_MANAGER_FOLLOW' | 'UNKNOWN';
    intentionDesc: string;
    expectedHandoverTime: string | null;
    expectedHandoverTimeDesc: string;
  };

  // 业主解约协议
  terminationAgreement: {
    hasValidAgreement: boolean;
    isSigned: boolean;
    agreementStatusDesc: string;
    agreementCode: string | null;
  };

  // 业主续约协议
  renewalAgreement: {
    hasValidRenewal: boolean;
    isSigned: boolean;
    renewalStatusDesc: string;
    renewalContractCode: string | null;
  };

  // 租客租赁合同
  tenantContract: {
    hasValidTenantContract: boolean;
    isSigned: boolean;
    tenantContractStatusDesc: string;
    tenantContractCode: string | null;
  };

  // 首招变更延长期
  firstRecruitExtension: {
    hasValidExtension: boolean;
    isConfirmed: boolean;
    extensionStatusDesc: string;
    extendStartDate: string | null;
    extendEndDate: string | null;
  };

  // 租客解约交割清单及物损
  tenantDelivery: {
    hasDeliveryOrder: boolean;
    isDeliveryFinished: boolean;
    deliveryStatusDesc: string;
    deliveryCode: string;
    hasDamage: boolean;
    damageDescList: string[];
    tenantContractCode: string;
    canProceedTermination: boolean;
  };

  // 业主解约交割清单及物损
  ownerDelivery: {
    hasDeliveryOrder: boolean;
    isDeliveryFinished: boolean;
    deliveryStatusDesc: string;
    deliveryCode: string;
    hasDamage: boolean;
    damageDescList: string[];
    canProceedTermination: boolean;
    zuwuManagerName: string;
    zuwuManagerPhone: string;
  };

  // 资管授权状态
  assetManagerAuth: {
    executionId: string;
    version: number;
    status: string;
    phase: string;
    ownerMode: string;
    assetState: string;
    authorization: 'AGREE_DRAFT' | 'DECLINE_DRAFT' | 'ASSET_MANAGER_FOLLOW' | 'CONTACT_LATER' | 'OTHER_RESULT' | 'UNKNOWN' | null;
    authorizationReason: string;
    authorizationStatus: string;
    nextContactAt: string | null;
    contractCheck: string;
    deliveryState: string;
    damageState: string;
    prerequisiteReason: string;
    contractStage: string;
    notificationState: string;
    endReason: string;
  };

  // 起草协议配置
  draftAgreement: {
    succeed: boolean;
    agreementId?: string;
    errorType?: ToolErrorType;
    errorMessage?: string;
  };

  // 记录调用日志与消息通知记录
  contactHistory: Array<{
    target: string;
    contactReason: string;
    content: string;
    remindRound?: number;
    timestamp: string;
  }>;

  callHistory: Array<{
    tool: string;
    payload: any;
    response: ResponseResult;
    timestamp: string;
  }>;
}

// 预设场景全集
export const SCENARIO_PRESETS: Record<string, { description: string; stateBuilder: () => MockState }> = {
  // ---------------------------------------------------------------------------
  // 首招到期场景组
  // ---------------------------------------------------------------------------
  'first_recruit_success': {
    description: '首招到期：全流程顺利起草成功（意向明确解约 -> 无在途解约 -> 无延长期 -> 无续约 -> 无租约 -> 资管已同意 -> 起草成功）',
    stateBuilder: () => ({
      ...getDefaultState(),
      intention: {
        intention: 'TERMINATE',
        intentionDesc: '解约',
        expectedHandoverTime: '2026-11-01',
        expectedHandoverTimeDesc: '指定日期',
      },
      assetManagerAuth: {
        ...getDefaultState().assetManagerAuth,
        assetState: 'AGREED',
        authorization: 'AGREE_DRAFT',
        authorizationReason: '资管已同意起草',
        authorizationStatus: 'AGREE',
        nextContactAt: null,
      },
      draftAgreement: {
        succeed: true,
        agreementId: 'AGR_SZ_20261027001',
      },
    }),
  },

  'first_recruit_signed': {
    description: '首招到期：已有解约协议且已签约完成（直接发送致谢回访关单）',
    stateBuilder: () => ({
      ...getDefaultState(),
      terminationAgreement: {
        hasValidAgreement: true,
        isSigned: true,
        agreementStatusDesc: '已签约',
        agreementCode: 'TC_SIGNED_999',
      },
    }),
  },

  'first_recruit_drafting': {
    description: '首招到期：已有在途待签或审批中解约协议（防重关单）',
    stateBuilder: () => ({
      ...getDefaultState(),
      terminationAgreement: {
        hasValidAgreement: true,
        isSigned: false,
        agreementStatusDesc: '已盖章待签约',
        agreementCode: 'TC_DRAFTING_888',
      },
    }),
  },

  'first_recruit_has_extension': {
    description: '首招到期：原合同存在有效首招延长期变更确认（阻断起草，直接关单）',
    stateBuilder: () => ({
      ...getDefaultState(),
      firstRecruitExtension: {
        hasValidExtension: true,
        isConfirmed: true,
        extensionStatusDesc: '确认完成',
        extendStartDate: '2026-11-01',
        extendEndDate: '2026-12-31',
      },
    }),
  },

  'first_recruit_has_renewal': {
    description: '首招到期：原合同已发起续约合同（业务互斥，直接关单）',
    stateBuilder: () => ({
      ...getDefaultState(),
      renewalAgreement: {
        hasValidRenewal: true,
        isSigned: true,
        renewalStatusDesc: '已签约',
        renewalContractCode: 'XY_20261027001',
      },
    }),
  },

  'first_recruit_has_tenant': {
    description: '首招到期：房源存在租客在租租赁协议（业务互斥，直接关单）',
    stateBuilder: () => ({
      ...getDefaultState(),
      tenantContract: {
        hasValidTenantContract: true,
        isSigned: true,
        tenantContractStatusDesc: '已签约在租',
        tenantContractCode: 'CZ_20261027001',
      },
    }),
  },

  'first_recruit_am_not_contacted': {
    description: '首招到期：资管未联系（触发初次私聊咨询资管 -> 挂起 schedule）',
    stateBuilder: () => ({
      ...getDefaultState(),
      assetManagerAuth: {
        ...getDefaultState().assetManagerAuth,
        assetState: 'NOT_CONTACTED',
        authorization: 'UNKNOWN',
        authorizationReason: '待联系资管确认',
        nextContactAt: '2026-10-27T16:00:00+08:00',
      },
    }),
  },

  'first_recruit_am_waiting_reply': {
    description: '首招到期：资管未回复且未达追问上限（触发私聊追问资管 -> 挂起 schedule）',
    stateBuilder: () => ({
      ...getDefaultState(),
      assetManagerAuth: {
        ...getDefaultState().assetManagerAuth,
        assetState: 'WAITING_REPLY',
        authorization: 'UNKNOWN',
        authorizationReason: '已发送待资管回复',
        nextContactAt: '2026-10-27T18:00:00+08:00',
      },
    }),
  },

  'first_recruit_am_exhausted': {
    description: '首招到期：资管经3次追问仍未回复，追问耗尽（nextContactAt 为 null，定义为资管未回复关单）',
    stateBuilder: () => ({
      ...getDefaultState(),
      assetManagerAuth: {
        ...getDefaultState().assetManagerAuth,
        assetState: 'WAITING_REPLY',
        authorization: 'UNKNOWN',
        authorizationReason: '3次追问耗尽仍未回复',
        nextContactAt: null,
      },
    }),
  },

  'first_recruit_am_decline': {
    description: '首招到期：资管暂不同意起草（保存意图 -> 私聊追问原因与是否稍后联系 -> 挂起 command: null）',
    stateBuilder: () => ({
      ...getDefaultState(),
      assetManagerAuth: {
        ...getDefaultState().assetManagerAuth,
        assetState: 'DECLINED',
        authorization: 'DECLINE_DRAFT',
        authorizationReason: '业主希望继续出租，暂不解约',
        nextContactAt: null,
      },
    }),
  },

  'first_recruit_am_follow': {
    description: '首招到期：资管明确表示自行线下跟进（保存意图 -> 结束工单 command: end）',
    stateBuilder: () => ({
      ...getDefaultState(),
      assetManagerAuth: {
        ...getDefaultState().assetManagerAuth,
        assetState: 'FOLLOW',
        authorization: 'ASSET_MANAGER_FOLLOW',
        authorizationReason: '资管明确表示线下沟通挽留，由其自行跟进',
        nextContactAt: null,
      },
    }),
  },

  'first_recruit_am_later_with_time': {
    description: '首招到期：资管要求稍后联系且时间明确（保存意图与时间 -> 挂起约定时间 schedule）',
    stateBuilder: () => ({
      ...getDefaultState(),
      assetManagerAuth: {
        ...getDefaultState().assetManagerAuth,
        assetState: 'WAITING_SCHEDULE',
        authorization: 'CONTACT_LATER',
        authorizationReason: '资管正与业主沟通租金，约定明天上午10点确认',
        nextContactAt: '2026-10-28T10:00:00+08:00',
      },
    }),
  },

  'first_recruit_am_later_no_time': {
    description: '首招到期：资管要求稍后联系但时间未明确（保存意图 -> 私聊追问具体时间 -> command: null）',
    stateBuilder: () => ({
      ...getDefaultState(),
      assetManagerAuth: {
        ...getDefaultState().assetManagerAuth,
        assetState: 'WAITING_REPLY',
        authorization: 'CONTACT_LATER',
        authorizationReason: '稍后再联系，未指定具体时间',
        nextContactAt: null,
      },
    }),
  },

  // ---------------------------------------------------------------------------
  // 委托到期场景组
  // ---------------------------------------------------------------------------
  'entrusted_success': {
    description: '委托到期：全流程顺利起草成功（意向解约 -> 无在途协议/续约/租约 -> 租客交割已完无物损 -> 业主交割已完无物损 -> 资管同意 -> 起草成功）',
    stateBuilder: () => ({
      ...getDefaultState(),
      intention: {
        intention: 'TERMINATE',
        intentionDesc: '解约',
        expectedHandoverTime: '2026-11-05',
        expectedHandoverTimeDesc: '指定日期',
      },
      tenantDelivery: {
        hasDeliveryOrder: true,
        isDeliveryFinished: true,
        deliveryStatusDesc: '已完成',
        deliveryCode: 'JG_ZK_20261027001',
        hasDamage: false,
        damageDescList: [],
        tenantContractCode: 'CZ_HIST_20261027001',
        canProceedTermination: true,
      },
      ownerDelivery: {
        hasDeliveryOrder: true,
        isDeliveryFinished: true,
        deliveryStatusDesc: '已完成',
        deliveryCode: 'WYJG_YZ_20261027001',
        hasDamage: false,
        damageDescList: [],
        canProceedTermination: true,
        zuwuManagerName: '张三',
        zuwuManagerPhone: '13800138000',
      },
      assetManagerAuth: {
        ...getDefaultState().assetManagerAuth,
        assetState: 'AGREED',
        authorization: 'AGREE_DRAFT',
        authorizationReason: '资管已核实交割完成，同意起草解约协议',
        authorizationStatus: 'AGREE',
        nextContactAt: null,
      },
      draftAgreement: {
        succeed: true,
        agreementId: 'AGR_WT_20261027002',
      },
    }),
  },

  'entrusted_tenant_delivery_unfinished': {
    description: '委托到期：租客交割未完成（联系租务同时催办租客交割与上传业主交割清单 -> command: null）',
    stateBuilder: () => ({
      ...getDefaultState(),
      tenantDelivery: {
        hasDeliveryOrder: true,
        isDeliveryFinished: false,
        deliveryStatusDesc: '进行中',
        deliveryCode: 'JG_ZK_20261027001',
        hasDamage: false,
        damageDescList: [],
        tenantContractCode: 'CZ_HIST_20261027001',
        canProceedTermination: false,
      },
    }),
  },

  'entrusted_owner_delivery_unfinished': {
    description: '委托到期：租客交割已完成，但业主解约交割单未完成（联系租务催办完成业主交割单 -> command: null）',
    stateBuilder: () => ({
      ...getDefaultState(),
      tenantDelivery: {
        hasDeliveryOrder: true,
        isDeliveryFinished: true,
        deliveryStatusDesc: '已完成',
        deliveryCode: 'JG_ZK_20261027001',
        hasDamage: false,
        damageDescList: [],
        tenantContractCode: 'CZ_HIST_20261027001',
        canProceedTermination: true,
      },
      ownerDelivery: {
        hasDeliveryOrder: true,
        isDeliveryFinished: false,
        deliveryStatusDesc: '进行中',
        deliveryCode: 'WYJG_YZ_20261027001',
        hasDamage: false,
        damageDescList: [],
        canProceedTermination: false,
        zuwuManagerName: '李四',
        zuwuManagerPhone: '13900139000',
      },
    }),
  },

  'entrusted_has_damage': {
    description: '委托到期：交割清单检查存在物品损坏（物损阻断，记录有物损并关单 command: end）',
    stateBuilder: () => ({
      ...getDefaultState(),
      tenantDelivery: {
        hasDeliveryOrder: true,
        isDeliveryFinished: true,
        deliveryStatusDesc: '已完成',
        deliveryCode: 'JG_ZK_20261027001',
        hasDamage: true,
        damageDescList: ['客厅-电视机：屏幕破碎损坏'],
        tenantContractCode: 'CZ_HIST_20261027001',
        canProceedTermination: false,
      },
      ownerDelivery: {
        hasDeliveryOrder: true,
        isDeliveryFinished: true,
        deliveryStatusDesc: '已完成',
        deliveryCode: 'WYJG_YZ_20261027001',
        hasDamage: true,
        damageDescList: ['客厅-电视机：屏幕破碎损坏'],
        canProceedTermination: false,
        zuwuManagerName: '张三',
        zuwuManagerPhone: '13800138000',
      },
    }),
  },

  // ---------------------------------------------------------------------------
  // 意向互斥与异常场景组
  // ---------------------------------------------------------------------------
  'intention_renew': {
    description: '业主续解意向为续约（RENEW，业务互斥直接关单 command: end）',
    stateBuilder: () => ({
      ...getDefaultState(),
      intention: {
        intention: 'RENEW',
        intentionDesc: '续约',
        expectedHandoverTime: null,
        expectedHandoverTimeDesc: '业主待确认',
      },
    }),
  },

  'intention_pending': {
    description: '业主续解意向尚未明确（PENDING / UNKNOWN，直接提前结束 command: end）',
    stateBuilder: () => ({
      ...getDefaultState(),
      intention: {
        intention: 'PENDING',
        intentionDesc: '待业主确认',
        expectedHandoverTime: null,
        expectedHandoverTimeDesc: '业主待确认',
      },
    }),
  },

  'intention_asset_manager_follow': {
    description: '业主续解意向标记为资管线下自跟进（ASSET_MANAGER_FOLLOW，直接关单 command: end）',
    stateBuilder: () => ({
      ...getDefaultState(),
      intention: {
        intention: 'ASSET_MANAGER_FOLLOW',
        intentionDesc: '资管跟进',
        expectedHandoverTime: null,
        expectedHandoverTimeDesc: '业主未回复',
      },
    }),
  },

  'draft_fail': {
    description: '起草解约协议接口异常报错（写操作0次重试，触发转人工 command: transfer_to_human）',
    stateBuilder: () => ({
      ...getDefaultState(),
      assetManagerAuth: {
        ...getDefaultState().assetManagerAuth,
        assetState: 'AGREED',
        authorization: 'AGREE_DRAFT',
        authorizationReason: '资管已同意起草',
        authorizationStatus: 'AGREE',
        nextContactAt: null,
      },
      draftAgreement: {
        succeed: false,
        errorType: ToolErrorType.BACKEND_FAILED,
        errorMessage: '合同系统网络异常，解约协议起草超时',
      },
    }),
  },
};

/** 默认基础状态（各项前置无冲突，业主意向明确解约） */
export function getDefaultState(): MockState {
  return {
    intention: {
      intention: 'TERMINATE',
      intentionDesc: '解约',
      expectedHandoverTime: '2026-11-01',
      expectedHandoverTimeDesc: '指定日期',
    },
    terminationAgreement: {
      hasValidAgreement: false,
      isSigned: false,
      agreementStatusDesc: '',
      agreementCode: null,
    },
    renewalAgreement: {
      hasValidRenewal: false,
      isSigned: false,
      renewalStatusDesc: '',
      renewalContractCode: null,
    },
    tenantContract: {
      hasValidTenantContract: false,
      isSigned: false,
      tenantContractStatusDesc: '已解约',
      tenantContractCode: null,
    },
    firstRecruitExtension: {
      hasValidExtension: false,
      isConfirmed: false,
      extensionStatusDesc: '无延长期记录',
      extendStartDate: null,
      extendEndDate: null,
    },
    tenantDelivery: {
      hasDeliveryOrder: true,
      isDeliveryFinished: true,
      deliveryStatusDesc: '已完成',
      deliveryCode: 'JG_DEFAULT_001',
      hasDamage: false,
      damageDescList: [],
      tenantContractCode: 'CZ_DEFAULT_001',
      canProceedTermination: true,
    },
    ownerDelivery: {
      hasDeliveryOrder: true,
      isDeliveryFinished: true,
      deliveryStatusDesc: '已完成',
      deliveryCode: 'WYJG_DEFAULT_001',
      hasDamage: false,
      damageDescList: [],
      canProceedTermination: true,
      zuwuManagerName: '张三',
      zuwuManagerPhone: '13800138000',
    },
    assetManagerAuth: {
      executionId: '123',
      version: 1,
      status: 'ACTIVE',
      phase: 'PREREQUISITES',
      ownerMode: 'AUTO',
      assetState: 'INIT',
      authorization: 'UNKNOWN',
      authorizationReason: '初始化等待联系',
      authorizationStatus: 'INIT',
      nextContactAt: '2026-10-27T16:00:00+08:00',
      contractCheck: 'PASS',
      deliveryState: 'PASS',
      damageState: 'NONE',
      prerequisiteReason: '',
      contractStage: 'WAIT_DRAFT',
      notificationState: 'NONE',
      endReason: '',
    },
    draftAgreement: {
      succeed: true,
      agreementId: 'AGR_DEFAULT_1001',
    },
    contactHistory: [],
    callHistory: [],
  };
}

// 全局当前运行时状态
let currentScenarioName = 'first_recruit_success';
let currentState: MockState = SCENARIO_PRESETS[currentScenarioName].stateBuilder();

// 全局历史记录（跨场景保留，供整体测试链路审计）
const globalCallHistory: MockState['callHistory'] = [];
const globalContactHistory: MockState['contactHistory'] = [];
currentState.callHistory = globalCallHistory;
currentState.contactHistory = globalContactHistory;

// =============================================================================
// 3. 核心工具处理器 (Handlers)
// =============================================================================

export class ToolHandlers {
  /** 1. 查询业主续解意向 */
  static queryOwnerIntention(payload: any): ResponseResult {
    const orderId = payload?.orderId;
    if (!orderId) {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '业务单ID不能为空');
    }

    const { intention, intentionDesc, expectedHandoverTime, expectedHandoverTimeDesc } = currentState.intention;
    return successResult({
      intention,
      intentionDesc,
      expectedHandoverTime,
      expectedHandoverTimeDesc,
    });
  }

  /** 2. 查询业主解约协议 */
  static queryOwnerTerminationAgreement(payload: any): ResponseResult {
    const contractCode = payload?.contractCode;
    if (!contractCode || String(contractCode).trim() === '') {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '原收房合同编号不能为空');
    }

    return successResult(currentState.terminationAgreement);
  }

  /** 3. 查询业主续约协议 */
  static queryOwnerRenewalAgreement(payload: any): ResponseResult {
    const contractCode = payload?.contractCode;
    if (!contractCode || String(contractCode).trim() === '') {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '原收房合同编号不能为空');
    }

    return successResult(currentState.renewalAgreement);
  }

  /** 4. 查询租客租赁协议 */
  static queryTenantContract(payload: any): ResponseResult {
    const contractCode = payload?.contractCode;
    if (!contractCode || String(contractCode).trim() === '') {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '原收房合同编号不能为空');
    }

    return successResult(currentState.tenantContract);
  }

  /** 5. 查询首招变更延长期协议 */
  static queryFirstRecruitExtensionAgreement(payload: any): ResponseResult {
    const contractCode = payload?.contractCode;
    if (!contractCode || String(contractCode).trim() === '') {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '原收房合同编号不能为空');
    }

    return successResult(currentState.firstRecruitExtension);
  }

  /** 6. 查询租客解约交割清单及物损 */
  static queryTenantDeliveryChecklist(payload: any): ResponseResult {
    const contractCode = payload?.contractCode;
    if (!contractCode || String(contractCode).trim() === '') {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '原收房合同编号不能为空');
    }

    return successResult(currentState.tenantDelivery);
  }

  /** 7. 查询业主解约交割清单及物损 */
  static queryOwnerDeliveryChecklist(payload: any): ResponseResult {
    const contractCode = payload?.contractCode;
    if (!contractCode || String(contractCode).trim() === '') {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '原收房合同编号不能为空');
    }

    return successResult(currentState.ownerDelivery);
  }

  /** 8. 查询资管同意发起授权 */
  static queryAssetManagerAuthorization(payload: any): ResponseResult {
    const executionId = payload?.executionId ?? payload?.orderId;
    if (!executionId) {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '推进记录ID不能为空');
    }

    return successResult({
      ...currentState.assetManagerAuth,
      executionId: String(executionId),
    });
  }

  /** 9. 保存资管授权确认与下次联系时间 */
  static saveAssetManagerAuthorization(payload: any): ResponseResult {
    const executionId = payload?.executionId ?? payload?.orderId;
    if (!executionId) {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '推进记录ID不能为空');
    }
    if (!payload?.authorization) {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '资管授权意图不能为空');
    }

    // 更新到当前内存状态中
    currentState.assetManagerAuth.authorization = payload.authorization;
    if (payload.reason) {
      currentState.assetManagerAuth.authorizationReason = payload.reason;
    }
    if (payload.nextContactAt !== undefined) {
      currentState.assetManagerAuth.nextContactAt = payload.nextContactAt;
    }

    return successResult({
      success: true,
      executionId: String(executionId),
      authorization: payload.authorization,
      reason: payload.reason,
      nextContactAt: currentState.assetManagerAuth.nextContactAt,
    });
  }

  /** 10. 联系租务和资管（企微私聊与工作通知） */
  static contactZuwuAndAssetManager(payload: any): ResponseResult {
    const contactReason = payload?.contactReason;
    if (!contactReason || String(contactReason).trim() === '') {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '联系原因不能为空');
    }

    const target = payload?.target || 'ALL';
    const content = payload?.content || contactReason;
    const remindRound = payload?.remindRound;

    // 记录到联系历史
    currentState.contactHistory.push({
      target,
      contactReason,
      content,
      remindRound,
      timestamp: new Date().toISOString(),
    });

    const taskId = `TASK_${Date.now()}`;
    return successResult({
      taskId,
      status: 'ACCEPTED',
      statusDesc: '已发送成功待回复',
      acceptedTargets: [target],
      contactedTargets: [target],
    });
  }

  /** 11. 起草业主解约协议 */
  static draftOwnerTerminationAgreement(payload: any): ResponseResult {
    const contractId = payload?.contractId;
    const type = payload?.type;
    const reason = payload?.reason;

    if (!contractId || String(contractId).trim() === '') {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '合同ID不能为空');
    }
    if (!type || String(type).trim() === '') {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '协议类型不能为空');
    }
    if (!reason || String(reason).trim() === '') {
      return errorResult(ToolErrorType.INVALID_ARGUMENT, '合同申请原因不能为空');
    }

    // 根据场景判定是否成功
    if (!currentState.draftAgreement.succeed) {
      const errType = currentState.draftAgreement.errorType || ToolErrorType.BACKEND_FAILED;
      const errMsg = currentState.draftAgreement.errorMessage || '合同系统起草协议失败';
      return errorResult(errType, errMsg);
    }

    const agreementId = currentState.draftAgreement.agreementId || `AGR_${Date.now()}`;
    return successResult({
      agreementId,
    });
  }
}

// 工具名称到 Handler 的映射表 (支持 snake_case 与 camelCase)
const TOOL_NAME_TO_HANDLER: Record<string, (payload: any) => ResponseResult> = {
  // 1. query_owner_intention
  'query_owner_intention': ToolHandlers.queryOwnerIntention,
  'queryOwnerIntention': ToolHandlers.queryOwnerIntention,

  // 2. query_owner_termination_agreement
  'query_owner_termination_agreement': ToolHandlers.queryOwnerTerminationAgreement,
  'queryOwnerTerminationAgreement': ToolHandlers.queryOwnerTerminationAgreement,

  // 3. query_owner_renewal_agreement
  'query_owner_renewal_agreement': ToolHandlers.queryOwnerRenewalAgreement,
  'queryOwnerRenewalAgreement': ToolHandlers.queryOwnerRenewalAgreement,

  // 4. query_tenant_contract
  'query_tenant_contract': ToolHandlers.queryTenantContract,
  'queryTenantContract': ToolHandlers.queryTenantContract,

  // 5. query_first_recruit_extension_agreement
  'query_first_recruit_extension_agreement': ToolHandlers.queryFirstRecruitExtensionAgreement,
  'queryFirstRecruitExtensionAgreement': ToolHandlers.queryFirstRecruitExtensionAgreement,

  // 6. query_tenant_delivery_checklist
  'query_tenant_delivery_checklist': ToolHandlers.queryTenantDeliveryChecklist,
  'queryTenantDeliveryChecklist': ToolHandlers.queryTenantDeliveryChecklist,

  // 7. query_owner_delivery_checklist
  'query_owner_delivery_checklist': ToolHandlers.queryOwnerDeliveryChecklist,
  'queryOwnerDeliveryChecklist': ToolHandlers.queryOwnerDeliveryChecklist,

  // 8. query_asset_manager_authorization
  'query_asset_manager_authorization': ToolHandlers.queryAssetManagerAuthorization,
  'queryAssetManagerAuthorization': ToolHandlers.queryAssetManagerAuthorization,

  // 9. save_asset_manager_authorization
  'save_asset_manager_authorization': ToolHandlers.saveAssetManagerAuthorization,
  'saveAssetManagerAuthorization': ToolHandlers.saveAssetManagerAuthorization,

  // 10. contact_zuwu_and_asset_manager
  'contact_zuwu_and_asset_manager': ToolHandlers.contactZuwuAndAssetManager,
  'contactZuwuAndAssetManager': ToolHandlers.contactZuwuAndAssetManager,

  // 11. draft_owner_termination_agreement
  'draft_owner_termination_agreement': ToolHandlers.draftOwnerTerminationAgreement,
  'draftOwnerTerminationAgreement': ToolHandlers.draftOwnerTerminationAgreement,
};

function dispatchTool(toolName: string, payload: any): ResponseResult {
  const handler = TOOL_NAME_TO_HANDLER[toolName];
  if (!handler) {
    return errorResult(ToolErrorType.NOT_IMPLEMENTED, `未实现的工具: ${toolName}`);
  }

  const result = handler(payload || {});

  // 记入调用审计历史
  currentState.callHistory.push({
    tool: toolName,
    payload,
    response: result,
    timestamp: new Date().toISOString(),
  });

  return result;
}

// =============================================================================
// 4. Express App 搭建与路由挂载
// =============================================================================

export function createMockApp() {
  const app = express();
  app.use(express.json());

  // 日志记录中间件
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
      console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${statusColor}${res.statusCode}\x1b[0m (${duration}ms)`);
    });
    next();
  });

  // ---------------------------------------------------------------------------
  // 首页与状态检查
  // ---------------------------------------------------------------------------
  app.get('/', (req: Request, res: Response) => {
    res.json({
      service: 'owner-self-termination-mock-server',
      currentScenario: currentScenarioName,
      scenarioDescription: SCENARIO_PRESETS[currentScenarioName]?.description,
      availableEndpoints: [
        'POST /call (统一网关，格式: { name, payload })',
        'POST /secure/agentTool/ownerTermination/:action (Landlord 真实后端路径)',
        'POST /:toolName (直连工具名称，如 POST /query_owner_intention)',
        'GET /mock/scenarios (获取所有预置用例列表)',
        'POST /mock/scenario/:name (切换场景)',
        'GET /mock/state (查看当前所有 Mock 数据与调用历史)',
        'POST /mock/reset (重置为默认场景)',
      ],
    });
  });

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'UP', currentScenario: currentScenarioName });
  });

  // ---------------------------------------------------------------------------
  // 场景管理与调试接口
  // ---------------------------------------------------------------------------

  // 获取所有预置场景
  app.get('/mock/scenarios', (req: Request, res: Response) => {
    const list = Object.entries(SCENARIO_PRESETS).map(([key, item]) => ({
      name: key,
      description: item.description,
      active: key === currentScenarioName,
    }));
    res.json(successResult({ currentScenario: currentScenarioName, scenarios: list }));
  });

  // 切换场景
  app.post(['/mock/scenario/:name', '/mock/scenario'], (req: Request, res: Response) => {
    const scenarioName = req.params.name || req.body?.scenario || req.body?.name;
    if (!scenarioName || !SCENARIO_PRESETS[scenarioName]) {
      return res.status(400).json(errorResult(ToolErrorType.INVALID_ARGUMENT, `未知场景: ${scenarioName}。可用场景请查阅 GET /mock/scenarios`));
    }

    const prevCallHistory = currentState.callHistory;
    const prevContactHistory = currentState.contactHistory;
    currentScenarioName = scenarioName;
    currentState = SCENARIO_PRESETS[scenarioName].stateBuilder();
    currentState.callHistory = prevCallHistory;
    currentState.contactHistory = prevContactHistory;
    console.log(`\x1b[33m[Mock Server] 切换场景为: ${scenarioName} (${SCENARIO_PRESETS[scenarioName].description})\x1b[0m`);

    res.json(successResult({
      scenario: scenarioName,
      description: SCENARIO_PRESETS[scenarioName].description,
    }));
  });

  // 查看当前全量 Mock 数据与调用历史
  app.get('/mock/state', (req: Request, res: Response) => {
    res.json(successResult({
      currentScenario: currentScenarioName,
      state: currentState,
    }));
  });

  // 重置为指定或默认场景
  app.post('/mock/reset', (req: Request, res: Response) => {
    const targetScenario = req.body?.scenario || 'first_recruit_success';
    if (!SCENARIO_PRESETS[targetScenario]) {
      return res.status(400).json(errorResult(ToolErrorType.INVALID_ARGUMENT, `未知场景: ${targetScenario}`));
    }
    const clearHistory = req.body?.clearHistory ?? true;
    currentScenarioName = targetScenario;
    currentState = SCENARIO_PRESETS[targetScenario].stateBuilder();
    if (!clearHistory) {
      currentState.callHistory = globalCallHistory;
      currentState.contactHistory = globalContactHistory;
    } else {
      globalCallHistory.length = 0;
      globalContactHistory.length = 0;
      currentState.callHistory = globalCallHistory;
      currentState.contactHistory = globalContactHistory;
    }
    console.log(`\x1b[33m[Mock Server] 状态已重置为: ${targetScenario}\x1b[0m`);
    res.json(successResult({ message: '状态重置成功', currentScenario: targetScenario }));
  });

  // 动态局部覆盖某个字段或工具返回
  app.post('/mock/override', (req: Request, res: Response) => {
    const { key, value } = req.body;
    if (!key || !(key in currentState)) {
      return res.status(400).json(errorResult(ToolErrorType.INVALID_ARGUMENT, `未知的状态字段: ${key}`));
    }
    (currentState as any)[key] = { ...(currentState as any)[key], ...value };
    res.json(successResult({ message: `字段 ${key} 已覆盖更新`, currentState }));
  });

  // ---------------------------------------------------------------------------
  // 统一网关 POST /call (供 Skill 的 Call({ name, payload }) 统一调用)
  // ---------------------------------------------------------------------------
  app.post(['/call', '/api/call'], (req: Request, res: Response) => {
    const { name, payload } = req.body || {};
    if (!name) {
      return res.status(400).json(errorResult(ToolErrorType.INVALID_ARGUMENT, '缺少工具名称参数 name'));
    }

    console.log(`\x1b[36m[TOOL GATEWAY] Call: ${name}\x1b[0m`, JSON.stringify(payload));
    const result = dispatchTool(name, payload);
    res.json(result);
  });

  // ---------------------------------------------------------------------------
  // 真实后端路径：POST /secure/agentTool/ownerTermination/:action
  // ---------------------------------------------------------------------------
  app.post('/secure/agentTool/ownerTermination/:action', (req: Request, res: Response) => {
    const action = req.params.action;
    console.log(`\x1b[36m[BACKEND ROUTE] ${action}\x1b[0m`, JSON.stringify(req.body));
    const result = dispatchTool(action, req.body);
    res.json(result);
  });

  // ---------------------------------------------------------------------------
  // 顶级工具直连：POST /:toolName (如 POST /query_owner_intention)
  // ---------------------------------------------------------------------------
  app.post('/:toolName', (req: Request, res: Response, next: NextFunction) => {
    const toolName = req.params.toolName;
    if (TOOL_NAME_TO_HANDLER[toolName]) {
      console.log(`\x1b[36m[DIRECT TOOL] ${toolName}\x1b[0m`, JSON.stringify(req.body));
      const result = dispatchTool(toolName, req.body);
      return res.json(result);
    }
    next();
  });

  return app;
}

// =============================================================================
// 5. 启动 Mock Server
// =============================================================================

const PORT = Number(process.env.PORT) || 8080;

const isDirectRun = process.argv[1]?.endsWith('mock-server.ts') || process.argv[1]?.endsWith('mock-server.js');

if (isDirectRun && !process.env.NODE_ENV?.includes('test')) {
  const app = createMockApp();
  app.listen(PORT, () => {
    console.log(`
====================================================================
  🏠 业主自助解约（owner-self-termination）Skill Mock Server 已启动
====================================================================
  监听端口: ${PORT}
  访问地址: http://localhost:${PORT}
  当前预设: \x1b[32m${currentScenarioName}\x1b[0m (${SCENARIO_PRESETS[currentScenarioName].description})

  可用核心路由:
    1. 统一网关:
       - POST http://localhost:${PORT}/call
       - 请求体: { "name": "query_owner_intention", "payload": { "orderId": 123 } }

    2. 贝壳 Landlord 真实路由:
       - POST http://localhost:${PORT}/secure/agentTool/ownerTermination/queryOwnerIntention
       - POST http://localhost:${PORT}/secure/agentTool/ownerTermination/queryOwnerTerminationAgreement
       - POST http://localhost:${PORT}/secure/agentTool/ownerTermination/queryAssetManagerAuthorization
       - POST http://localhost:${PORT}/secure/agentTool/ownerTermination/draftOwnerTerminationAgreement
       - POST http://localhost:${PORT}/secure/agentTool/ownerTermination/contactZuwuAndAssetManager
       - ... (共 11 个核心接口全覆盖)

    3. 工具直连路由:
       - POST http://localhost:${PORT}/query_owner_intention
       - POST http://localhost:${PORT}/draft_owner_termination_agreement

    4. 场景切换与调试 API:
       - 查看所有场景: GET  http://localhost:${PORT}/mock/scenarios
       - 切换场景:     POST http://localhost:${PORT}/mock/scenario/entrusted_success
       - 查看当前状态: GET  http://localhost:${PORT}/mock/state
       - 重置状态:     POST http://localhost:${PORT}/mock/reset
====================================================================
`);
  });
}
