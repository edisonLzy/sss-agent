# 业主续解自动化 Tool 契约

本文件记录 Skill 使用的 Tool 名称、输入输出字段及语义规范。合同自动解约触发与申请查询以[合同侧接入文档第八章](https://beike.feishu.cn/wiki/WbCRw07TziVLWIkbnJIcUnEcnFd)为准，以下为需工程适配、注册的目标契约，不表示已上线。其余工具沿用既有定义。字段名须严格原样使用，不得沿用与合同文档冲突的 Landlord 预留字段。

---

## 目录
1. [通用协议与错误码](#通用协议与错误码)
2. [query_owner_termination_agreement（查询业主解约协议）](#query_owner_termination_agreement)
3. [query_owner_renewal_agreement（查询业主续约协议）](#query_owner_renewal_agreement)
4. [query_tenant_contract（查询租客租赁协议）](#query_tenant_contract)
5. [query_tenant_delivery_checklist（查询租客解约交割清单及物损）](#query_tenant_delivery_checklist)
6. [query_first_recruit_extension_agreement（查询首招变更延长期协议）](#query_first_recruit_extension_agreement)
7. [query_owner_delivery_checklist（查询业主解约交割清单及物损）](#query_owner_delivery_checklist)
8. [query_owner_intention（查询业主续解意向）](#query_owner_intention)
9. [query_asset_manager_authorization（查询资管同意发起授权）](#query_asset_manager_authorization)
10. [draft_owner_termination_agreement（起草业主解约协议）](#draft_owner_termination_agreement)
11. [query_owner_termination_auto_apply（查询合同自动解约申请）](#query_owner_termination_auto_apply)
12. [contact_zuwu_and_asset_manager（联系租务和资管）](#contact_zuwu_and_asset_manager)

---

## 通用协议与错误码

### 1. 公共链路参数 (BaseToolRequest)
除个别工具外，多数工具请求体均支持以下链路字段（非必填）：
- `sessionId` (String): 会话 ID，用于大模型交互链路全流程追踪。
- `requestId` (String): 请求 ID，用于后端日志检索与排查。

### 2. 统一响应外层结构 (ResponseResult)
```json
{
  "errno": "0",
  "errmsg": "success",
  "data": { ... }
}
```
- `errno == "0"`：调用成功，实际返回内容位于 `data` 对象中。
- `errno != "0"`：调用失败，错误信息由 `errmsg` 携带。错误码按字符串读取。

### 3. 常见业务错误码
- `1001`：登录态上下文缺失（系统拦截）。
- `1003`：请求参数非法（缺少必填参数或格式不符，可根据明确报错修正参数后重试 1 次）。
- `1004`：下游服务或微服务调用超时/失败。
- `1007`：业务规则不允许该操作。
- `501`：工具尚未接入实现。

---

## query_owner_termination_agreement

**功能简介**：
查询当前收房合同是否已存在解约协议及其实时签约状态（已排除已作废、已无效协议）。

**输入参数 (Request)**：
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `contractCode` | String | **是** | 业主原收房合同编号（托管合同编号） |
| `orderId` | Long | 否 | 外部协同工单 ID / 意向工单 ID |
| `sessionId` | String | 否 | 会话 ID |
| `requestId` | String | 否 | 请求 ID |

**输出参数 (Response / Data)**：
| 字段名 | 类型 | 说明及取值语义 |
| :--- | :--- | :--- |
| `hasValidAgreement` | Boolean | 是否存在有效解约协议。`true` 表示存在（起草中/已盖章/已签约）；`false` 表示无有效协议（无协议或已作废）。 |
| `isSigned` | Boolean | 是否已完成签约。`true` 表示已签约生效；`false` 且 `hasValidAgreement=true` 表示处于审批中或待签中。 |
| `agreementStatusDesc` | String | 协议自然语言状态描述（如“已盖章待签约”、“起草中”、“已签约”等）。 |
| `agreementCode` | String | 解约协议编码，无有效协议时为 `null`。 |

**调用约束**：
- 属性：只读查询。
- 允许重试：网络异常允许重试 1 次。

---

## query_owner_renewal_agreement

**功能简介**：
查询当前托管房源/收房合同是否已发起“续约合同”及其实时签约状态（已排除已作废、已无效、已解约）。

**输入参数 (Request)**：
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `contractCode` | String | **是** | 业主原收房合同编号（托管合同编号） |
| `houseCode` | Long | 否 | 托管房源编码（未传时后端自动反查补齐） |
| `orderId` | Long | 否 | 外部协同工单 ID / 意向工单 ID |
| `sessionId` | String | 否 | 会话 ID |
| `requestId` | String | 否 | 请求 ID |

**输出参数 (Response / Data)**：
| 字段名 | 类型 | 说明及取值语义 |
| :--- | :--- | :--- |
| `hasValidRenewal` | Boolean | 是否存在有效续约合同。`true` 表示存在（包含已签约、起草中、已盖章待签约）；`false` 表示无有效续约（无记录或已作废/已解约）。 |
| `isSigned` | Boolean | 续约合同是否已签约完成。`true` 表示续约已签约生效；`false` 表示续约正在起草或盖章待签中。 |
| `renewalStatusDesc` | String | 续约合同自然语言状态（如“已签约”、“已盖章待签约”、“起草中”、“已作废”等）。 |
| `renewalContractCode` | String | 续约收房合同编码，无有效续约时为 `null` 或历史作废编码。 |

**调用约束**：
- 属性：只读查询。
- 允许重试：网络异常允许重试 1 次。

---

## query_tenant_contract

**功能简介**：
查询当前托管房源是否存在生效的租客出房合同（`OUT_CONTRACT`）及其实时签约状态（已排除已退租解约、已作废、已无效合同）。

**输入参数 (Request)**：
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `contractCode` | String | **是** | 业主原收房合同编号（托管合同编号） |
| `houseCode` | Long | 否 | 托管房源编码（未传时后端自动反查补齐） |
| `orderId` | Long | 否 | 外部协同工单 ID / 意向工单 ID |
| `sessionId` | String | 否 | 会话 ID |
| `requestId` | String | 否 | 请求 ID |

**输出参数 (Response / Data)**：
| 字段名 | 类型 | 说明及取值语义 |
| :--- | :--- | :--- |
| `hasValidTenantContract` | Boolean | 是否存在有效租客出房合同。`true` 表示存在（已签约在租、起草中、已盖章待签约）；`false` 表示无在租租约（无合同、已解约退租、已作废）。 |
| `isSigned` | Boolean | 租客出房合同是否已签约生效。`true` 表示租客已签约在租；`false` 且 `hasValidTenantContract=true` 表示新租客正在办理签约中。 |
| `tenantContractStatusDesc` | String | 租客合同自然语言状态（如“已签约”、“已盖章待签约”、“起草中”、“已解约”等）。 |
| `tenantContractCode` | String | 租客出房合同编码，无有效合同时为最新已解约编码或 `null`。 |

**调用约束**：
- 属性：只读查询。
- 允许重试：网络异常允许重试 1 次。

---

## query_tenant_delivery_checklist

**功能简介**：
查询上任租客退租解约交割单的验收完结状态及物品损坏（物损）明细。

**输入参数 (Request)**：
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `contractCode` | String | **是** | 业主原收房合同编号（托管合同编号） |
| `tenantContractCode` | String | 否 | 租客出房合同编号（未传时后端自动反查最新出房合同） |
| `houseCode` | Long | 否 | 托管房源编码（未传时后端自动反查补齐） |
| `orderId` | Long | 否 | 外部协同工单 ID / 意向工单 ID |
| `sessionId` | String | 否 | 会话 ID |
| `requestId` | String | 否 | 请求 ID |

**输出参数 (Response / Data)**：
| 字段名 | 类型 | 说明及取值语义 |
| :--- | :--- | :--- |
| `hasDeliveryOrder` | Boolean | 是否生成了租客解约交割单。`true` 表示已建交割单；`false` 表示尚未生成交割单。 |
| `isDeliveryFinished` | Boolean | 租客解约交割是否已完结验收。`true` 表示交割验收已完成（status=2）；`false` 表示进行中或未开始。 |
| `deliveryStatusDesc` | String | 交割状态自然语言描述（如“已完成”、“进行中”、“未开始”、“未生成”等）。 |
| `deliveryCode` | String | 租客解约交割单号。 |
| `hasDamage` | Boolean | 交割清单中是否存在物品损坏/物损。`true` 表示存在损坏异常；`false` 表示物品全部正常。 |
| `damageDescList` | List&lt;String&gt; | 损坏物品标签明细列表（如 `["客厅-电视机：损坏"]`，无损坏时为空列表）。 |
| `tenantContractCode` | String | 关联的租客出房合同编号。 |
| `canProceedTermination` | Boolean | 实体验收维度是否满足自动化条件。等价于 `isDeliveryFinished && !hasDamage`。 |

**调用约束**：
- 属性：只读查询。
- 允许重试：网络异常允许重试 1 次。

---

## query_first_recruit_extension_agreement

**功能简介**：
查询原收房合同是否存在首招变更延长期确认/协议及其实时进展（已排除已无效、已作废、已过期记录）。

**输入参数 (Request)**：
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `contractCode` | String | **是** | 业主原收房合同编号（托管合同编号） |
| `orderId` | Long | 否 | 外部协同工单 ID / 意向工单 ID |
| `sessionId` | String | 否 | 会话 ID |
| `requestId` | String | 否 | 请求 ID |

**输出参数 (Response / Data)**：
| 字段名 | 类型 | 说明及取值语义 |
| :--- | :--- | :--- |
| `hasValidExtension` | Boolean | 是否存在有效延长期确认。`true` 表示存在（待提交、确认中、确认完成）；`false` 表示无延长期变更（无记录或已作废/无效/过期）。 |
| `isConfirmed` | Boolean | 延长期协议是否已确认生效。`true` 表示确认完成（status=2）；`false` 表示待提交或确认中。 |
| `extensionStatusDesc` | String | 延长期状态自然语言描述（如“确认完成”、“确认中”、“待提交”、“已作废”、“已无效”、“已过期”等）。 |
| `extendStartDate` | String | 延长期生效开始日期（格式：`yyyy-MM-dd`，可为空）。 |
| `extendEndDate` | String | 延长期生效截止日期（格式：`yyyy-MM-dd`，可为空）。 |

**调用约束**：
- 属性：只读查询。
- 允许重试：网络异常允许重试 1 次。

---

## query_owner_delivery_checklist

**功能简介**：
查询省心租向业主交还房屋时，业主解约物业交割单（还房交割单）的进展状态、物品损坏明细及负责该房源的租务管家信息。

**输入参数 (Request)**：
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `contractCode` | String | **是** | 业主原收房合同编号（托管合同编号） |
| `houseCode` | Long | 否 | 托管房源编码（未传时后端自动反查补齐） |
| `orderId` | Long | 否 | 外部协同工单 ID / 意向工单 ID |
| `sessionId` | String | 否 | 会话 ID |
| `requestId` | String | 否 | 请求 ID |

**输出参数 (Response / Data)**：
| 字段名 | 类型 | 说明及取值语义 |
| :--- | :--- | :--- |
| `hasDeliveryOrder` | Boolean | 是否生成了业主解约交割单。`true` 表示已生成还房单；`false` 表示尚未建还房单。 |
| `isDeliveryFinished` | Boolean | 业主解约交割是否已完结验收。`true` 表示还房验收已完成（status=2）；`false` 表示进行中或未开始。 |
| `deliveryStatusDesc` | String | 自然语言状态描述（如“已完成”、“进行中”、“未开始”、“未生成业主解约交割单”等）。 |
| `deliveryCode` | String | 业主解约交割单号。 |
| `hasDamage` | Boolean | 交割清单中是否存在物品损坏/物损。`true` 表示有物损；`false` 表示无物损。 |
| `damageDescList` | List&lt;String&gt; | 损坏物品标签明细列表（如 `["主卧-空调：缺氟不制冷"]`，无损坏时为空列表）。 |
| `canProceedTermination` | Boolean | 实体验收维度是否满足自动化条件。等价于 `isDeliveryFinished && !hasDamage`。 |
| `zuwuManagerName` | String | 负责该房源的租务管家姓名。 |
| `zuwuManagerPhone` | String | 负责该房源的租务管家联系电话。 |

**调用约束**：
- 属性：只读查询。
- 允许重试：网络异常允许重试 1 次。

---

## query_owner_intention

**功能简介**：
基于协同工单 ID 查询业主在群内沟通或事实表中记录的真实意向（解约/续约/待确认/资管跟进）及预计交房时间。

**输入参数 (Request)**：
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `orderId` | Long | **是** | 续解业务协同工单 ID |
| `sessionId` | String | 否 | 会话 ID |
| `requestId` | String | 否 | 请求 ID |

**输出参数 (Response / Data)**：
| 字段名 | 类型 | 说明及取值语义 |
| :--- | :--- | :--- |
| `intention` | String | 业主意向标准枚举编码：<br>- `TERMINATE`：明确解约<br>- `RENEW`：明确续约<br>- `PENDING`：待业主确认<br>- `ASSET_MANAGER_FOLLOW`：资管跟进<br>- `UNKNOWN`：未知意向 |
| `intentionDesc` | String | 意向自然语言描述（如“解约”、“续约”、“待业主确认”、“资管跟进”、“未知”等）。 |
| `expectedHandoverTime` | String | 业主期望交房/验房时间（格式：`yyyy-MM-dd`，无指定时为 `null`）。 |
| `expectedHandoverTimeDesc` | String | 期望交房时间文字说明（如“指定日期”、“业主未回复”、“业主待确认”等）。 |

**调用约束**：
- 属性：只读查询。
- 允许重试：网络异常允许重试 1 次。

---

## query_asset_manager_authorization

**功能简介**：
查询负责该收房合同的资管管家是否同意发起解约流程的授权确认状态，并同步获取当前解约推进记录的精简客观事实。支持通过推进记录 ID（`executionId`）或业务协同工单 ID（`orderId`）进行同模块 Service 直连查询。

**输入参数 (Request)**：
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `executionId` | Long | 选填 | 推进记录 ID（对应 `owner_termination_execution.id`，若有值则优先使用） |
| `orderId` | Long | 选填 | 续解业务协同工单 ID（若无 `executionId` 时兼容使用，二者至少提供其一） |
| `contractCode` | String | 否 | 原收房合同编号（保留拓展入参） |
| `sessionId` | String | 否 | 会话 ID |
| `requestId` | String | 否 | 请求 ID |

**输出参数 (Response / Data)**：
| 字段名 | 类型 | 说明及取值语义 |
| :--- | :--- | :--- |
| `executionId` | String | 推进记录 ID，对应推进事实表主键。 |
| `version` | Integer | 最新数据版本号，用于并发控制。 |
| `status` | String | 推进业务状态（如 `ACTIVE`、`COMPLETED`）。 |
| `phase` | String | 当前推进阶段（如 `PREREQUISITES` 前置核验阶段）。 |
| `ownerMode` | String | 推进模式（`AUTO` 自动 / `MANUAL` 人工）。 |
| `assetState` | String | 资管联系状态（如 `AGREED` 资管已同意、`INIT` 待联系等）。 |
| `authorization` | String | **资管授权结果标准编码**：<br>- `AGREE_DRAFT`：资管同意起草<br>- `OTHER_RESULT`：资管其他回复（如线下跟进、不同意等）<br>- `UNKNOWN` / `null`：未确定（未联系或未回复） |
| `authorizationReason` | String | 资管授权结果原因描述（如“资管已同意起草”）。 |
| `contractCheck` | String | 前置检查-合同检查结果。 |
| `deliveryState` | String | 前置检查-交割状态。 |
| `damageState` | String | 前置检查-物损状态。 |
| `prerequisiteReason` | String | 前置检查未通过或阻断原因。 |
| `contractStage` | String | 合同节点状态。 |
| `notificationState` | String | 客户通知状态。 |
| `endReason` | String | 结束原因。 |

**调用约束**：
- 属性：只读查询。
- 允许重试：网络异常允许重试 1 次。

---

## draft_owner_termination_agreement

**功能简介**：
沿用此 Skill Tool 标识，目标适配合同侧 `ContractInTerminationAutoApplyFacade.triggerAutoTermination(InTerminationAutoApplyReq)`，返回 `InTerminationAutoApplyResp`。该接口同步完成准备和起草，后续提交、签前审核、盖章、发送业主异步推进。

**权威接口与接入边界**：
- Facade 为 `com.ke.home.trusteeship.contract.api.facade.ContractInTerminationAutoApplyFacade`，字段及类型以合同文档第八章接入定义为准。
- 原生 Dubbo 直接返回响应对象；无法受理的参数、鉴权、主合同不存在或参数冲突等请求抛业务异常。若 Tool 网关沿用本文 `ResponseResult` 包装，原生响应放在 `data` 中；`errno="0"` 只表示调用返回，业务结果必须继续读取 `applyStatus/currentNode`。
- 不再使用旧的 `type`、合同申请 `reason` 或 `agreementId`。`sessionId/requestId` 由工程运行上下文承担追踪，不作为合同 DTO 的业务入参。不得向原生接口添加外部请求唯一标识、操作人、费用或银行账户参数。
- 本次只修订 Skill 契约。Landlord 的起草实现仍是待接入占位，目标 Tool 的适配和查询 Tool 注册完成后方可执行；未接入时按技术异常处理，不能退回旧字段或模拟成功。

**输入参数（Skill Tool 的 JSON 约定 → 原生 DTO）**：
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `contractId` | Long | **是** | 大于 0 的收房主合同 `contract` 表主键，取自 `{{fields.contractId}}`，不能用合同编号代替 |
| `terminationType` | Integer | **是** | 合同侧枚举：`1`=合同到期（委托到期）；`7`=招租期届满招租失败（首招到期）。不得传业务描述字符串或 Landlord 本地类型 `2` |
| `backDate` | Tool JSON 为 String；原生 DTO 为 `java.util.Date` | **是** | Skill 传上游确认的 `{{fields.backDate}}`（`yyyy-MM-dd`）；适配层按统一业务时区 `Asia/Shanghai` 转为该日零点的 `Date`。以第八章 DTO 定义为准，不能将第六章字符串示例直接当作 Dubbo 类型 |

还房日缺失或格式不合法时先停止调用、转人工核验，不用今天、触发日或首招结束日填充。日期是否合法由合同侧按业务规则校验，模型不自行修正运行时字段。

**输出参数 (Response / Data)**：
| 字段名 | 类型 | 说明及取值语义 |
| :--- | :--- | :--- |
| `autoApplyId` | Long | 本次自动申请 ID；重复调用命中已有申请时返回同一申请 ID |
| `terminationContractId` | Long 或 null | 解约协议 ID；尚未生成时为 null，生成后保留 |
| `applyStatus` | Integer | `1`执行中、`2`发送业主操作完成、`3`失败、`4`人工终止。`2` 不表示业主已签署 |
| `currentNode` | Integer | 当前或停止节点：`1`准备、`2`起草、`3`完善及提交、`4`签前审核、`5`盖章、`6`发送业主；不是该节点已完成的独立证明 |

### 自动申请结果处理

以下规则适用于触发返回与查询返回；所有 `Return` 仍为 `command/nextScheduleAt/finalAnswer/reason` 四字段，非 `schedule` 时 `nextScheduleAt=null`。

| 已确认的申请事实 | 本轮处理 |
| :--- | :--- |
| 有效 `autoApplyId`、`applyStatus=1` 且 `terminationContractId` 非空有效 | 已生成协议并继续办理，返回 `command=null`；允许群发时播报“协议已起草，后续办理中”，等待工程事件，不安排催签 |
| 有效 `autoApplyId`、`applyStatus=1`，`terminationContractId=null` | 仅确认申请执行中，返回 `command=null`，等待工程事件；如需播报只说“申请已受理、正在办理”，不能声称已起草成功 |
| `applyStatus=2` | 已发送业主。交工程侧核验并按可信 `OWNER_NOTIFY` 用途处理，不回退播报起草进展，也不能当作实际签署后办结 |
| `applyStatus=3` | 先用该次 `autoApplyId` 查询详情，按下列失败分类处理；不能仅凭触发返回就笼统 `end` 或转人工 |
| `applyStatus=4` | 人工终止，停止自动办理及重试，输出 `transfer_to_human` 并记录查询到的原因；工程侧幂等处理人工接管，避免重复分配 |
| 快照缺失、枚举未知、ID 不合法或状态相互矛盾 | 不推断成功或前置失败；查询核验，仍不能确认则转人工，禁止盲目再起草 |

**查询后的失败分类**：
- `applyStatus=3`、`terminationContractId=null`，且查询明确为起草前置业务校验失败（准备/起草节点，`reasonCode=1` 或 `2`）时，返回 `command="end"`、`finalAnswer=null`，`reason` 原样保留合同侧原因。若返回完整 `backDateRange`，由工程侧记录供核验；本次不自动改日期重试。
- 签前审核驳回（`reasonCode=3`）、明确执行失败（`4`）及其他不能确认的失败，按本期规则转人工，保留失败节点和原因；不因同为 `applyStatus=3` 就当成前置失败。
- 外部操作结果不确定（`reasonCode=5`）先查询确认；仍不确定则转人工，不 `end`，不重新触发。
- 原因码或原因缺失时不能编造。合同侧业务失败可以通过正常响应中的 `applyStatus=3` 表达，不固定依赖网关错误码 `1007`，也不从 `errmsg` 猜测业务阶段。

**防重与重试**：
- 已生成协议、申请执行中或人工终止时，不重新起草。合同侧处理中重复调用会返回同一申请快照，Skill 仍应避免无意义重复触发。
- 触发超时且未取得 `autoApplyId` 时，先按原主合同 `contractId` 查询最新申请并核对本次关联；已知申请 ID 或消费合同事件时，必须按对应 `autoApplyId` 精确查询。
- 本期不自动重试已受理的业务失败。合同文档允许的“未生成协议、明确失败后重新发起”需由服务管家另行明确决定，不由本 Skill 自动改日期或重放请求。未受理的明确参数错误仅按原有参数修正规则处理。
- 未找到申请、查询异常或结果不确定不能当作“安全重试”的证明；无法确认时转人工。

---

## query_owner_termination_auto_apply

**目标 Tool，待工程注册**：适配同一 Facade 的 `queryAutoTermination(InTerminationAutoApplyQueryReq)`，返回 `InTerminationAutoApplyQueryResp`。该工具只查询自动申请，不能用已有的 `query_owner_termination_agreement` 协议查询替代。

**输入参数**：

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `autoApplyId` | Long | 与 `contractId` 恰传一个 | 大于 0；精确查询某次申请，失败查询及消费事件时优先使用 |
| `contractId` | Long | 与 `autoApplyId` 恰传一个 | 大于 0；按收房主合同查询最新申请，仅用于首次触发超时、未获申请 ID 等场景 |

两个参数同时传、均不传、ID 非正数或没有申请记录均为业务异常；查询不会创建申请。消息处理使用消息中的申请 ID，不能以主合同最新记录替代历史申请。

**输出参数（原生 DTO）**：

| 字段名 | Java 类型 | 说明 |
| :--- | :--- | :--- |
| `autoApplyId`、`contractId` | Long | 自动申请 ID、收房主合同 ID |
| `terminationContractId` | Long 或 null | 解约协议 ID，未生成时为空 |
| `applyStatus`、`currentNode` | Integer | 与触发响应相同的申请状态、当前/停止节点 |
| `reasonCode` | Integer 或 null | `1`还房日校验失败、`2`其他业务校验失败、`3`签前审核驳回、`4`明确执行失败、`5`外部操作结果不确定、`6`人工介入终止；以实际合同侧枚举为准 |
| `reason` | String 或 null | 合同侧可读原因；不可用来解析日期或猜测授权 |
| `backDateRange` | InTerminationAutoApplyBackDateRangeResp 或 null | 完整合法日期范围，子字段 `Date minBackDate`、`Date maxBackDate` 均包含当天；单日范围两者相同，无法完整计算或没有合法范围时整个对象为空 |

这里只列本流程使用的查询字段，其余响应字段见合同文档。JSON 日期由适配层按统一业务时区转换，不能假设原生 `Date` 的线上序列化格式已确认；日期范围不得返回部分边界，不解析中文原因获取日期。该工具只读，执行本文读操作重试规则。

---

## contact_zuwu_and_asset_manager

**功能简介**：
向专属租务管家和资管经理发起企微私聊/工作通知催办与结构化确认（消息推送通道已打通，支持双向交互通知、多轮催办与追问消息下发）。

**输入参数 (Request)**：
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `executionId` | Long | 选填 | 推进记录 ID（对应 `owner_termination_execution.id`） |
| `orderId` | Long | 选填 | 续解业务协同工单 ID |
| `contractCode` | String | 选填 | 原收房合同编号（`executionId`/`orderId`/`contractCode` 三者至少提供一项） |
| `houseCode` | Long | 否 | 托管房源编码 |
| `target` | String | 否 | 联系目标角色：`ALL`（租务与资管，默认）、`ZUWU`（租务管家）、`ASSET_MANAGER`（资管管家） |
| `contactReason` | String | **是** | 联系/催办原因（如“催促租客交割进度”、“催促上传业主交割清单”、“咨询资管是否发起解约”、“资管未回复追问催办”、“物损确认”） |
| `content` | String | **是** | 具体推送消息正文或追问话术（如：“您好，该房屋临期解约协议已准备完毕，是否可以发送业主签署？”） |
| `remindRound` | Integer | 否 | 当前催办/追问轮次（例如：资管追问 `1` 代表第 1 次追问 2h、`2` 代表 4h、`3` 代表 t+1；租务交割 `1` 代表首次提醒、`2` 代表当天二次提醒） |
| `sessionId` | String | 否 | 会话 ID |
| `requestId` | String | 否 | 请求 ID |

**输出参数 (Response / Data)**：
| 字段名 | 类型 | 说明及取值语义 |
| :--- | :--- | :--- |
| `taskId` | String | 联系任务流水号。 |
| `status` | String | 联系推送结果状态编码（如 `SUCCESS`、`PENDING_REPLY`、`FAILED`）。 |
| `statusDesc` | String | 联系结果状态自然语言描述（如“已发送成功待回复”、“发送失败”等）。 |
| `contactedTargets` | List<String> | 实际触达目标列表（如 `["ASSET_MANAGER"]`）。 |

**调用约束**：
- 属性：**写操作工具（通知/催办）**。
- 自动重试：**0 次**（避免由于微服务超时造成重复重发骚扰管家）。
- 异常处置：接口报错时转人工服务管家排查。
