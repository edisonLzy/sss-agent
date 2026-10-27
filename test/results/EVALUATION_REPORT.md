# 业主自助解约（owner-self-termination）Skill 全场景评测总结报告

- **评测执行主体**: Agent Runner (AI 角色决策与工具链路调度引擎)
- **评测时间**: 2026/10/27 23:00:26
- **评测环境**: Live Mock Server (`http://localhost:8080`)
- **评测用例总数**: 25
- **通过数量**: 25
- **失败数量**: 0
- **综合通过率**: **100.0%**

---

## 一、评测结果矩阵汇总

| 用例编号 | 业务模块 | 用例名称 | 核心判定分支 | 执行耗时 | 最终指令 (Command) | 结果 |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| `TC01_PARAM_MISSING_ORDER_ID` | 前置参数校验 | 前置参数校验-缺失orderId | 必填字段 orderId 为空时，触发前置校验失败并直接转人工服务管家 | 29ms | `transfer_to_human` | ✅ 通过 |
| `TC02_PARAM_MISSING_CONTRACT_CODE` | 前置参数校验 | 前置参数校验-缺失contractCode | 必填字段 contractCode 为空时，触发前置校验失败并直接转人工服务管家 | 2ms | `transfer_to_human` | ✅ 通过 |
| `TC03_PARAM_MISSING_TERMINATION_TYPE` | 前置参数校验 | 前置参数校验-缺失terminationType | 必填字段 terminationType 缺失时，触发前置校验失败并直接转人工服务管家 | 1ms | `transfer_to_human` | ✅ 通过 |
| `TC04_INTENTION_RENEW` | 意向分流 | 意向分流-业主明确续约 | 业主意向为续约 (RENEW)，属于业务互斥，直接输出 command: end 提前结束 | 3ms | `end` | ✅ 通过 |
| `TC05_INTENTION_PENDING` | 意向分流 | 意向分流-待业主确认 | 业主意向尚未确定 (PENDING)，无法自动推进解约，输出 command: end 提前结束 | 2ms | `end` | ✅ 通过 |
| `TC06_INTENTION_UNKNOWN` | 意向分流 | 意向分流-未知意向 | 业主意向为未知意向 (UNKNOWN)，输出 command: end 提前结束 | 3ms | `end` | ✅ 通过 |
| `TC07_INTENTION_AM_FOLLOW` | 意向分流 | 意向分流-资管线下自跟进 | 意向标记为资管线下自跟进 (ASSET_MANAGER_FOLLOW)，输出 command: end 提前结束 | 1ms | `end` | ✅ 通过 |
| `TC08_TYPE_UNSUPPORTED` | 业务类型分流 | 解约类型分流-不支持的解约类型 | 业主意向明确解约，但解约类型为非本期支持的类型（如托管中途解约），输出 command: end 提前结束 | 1ms | `end` | ✅ 通过 |
| `TC09_FR_SIGNED_AGREEMENT` | 首招到期子流程 | 首招到期-已有已签约解约协议 | 原收房合同已完成解约协议签署，发送致谢与不合作原因回访，输出 command: end 办结关单 | 2ms | `end` | ✅ 通过 |
| `TC10_FR_DRAFTING_AGREEMENT` | 首招到期子流程 | 首招到期-已有在途待签协议 | 原收房合同已存在审批中或待签署的解约协议，防重提前结束自动推进，输出 command: end | 2ms | `end` | ✅ 通过 |
| `TC11_FR_HAS_EXTENSION` | 首招到期子流程 | 首招到期-存在首招延长期变更协议 | 原合同已办理或正在推进首招延长期变更，不可按到期解约，直接关单 command: end | 2ms | `end` | ✅ 通过 |
| `TC12_FR_HAS_RENEWAL` | 首招到期子流程 | 首招到期-存在业主续约合同 | 原合同已存在有效续约合同，定义为“业主续约”，直接关单 command: end | 3ms | `end` | ✅ 通过 |
| `TC13_FR_HAS_TENANT` | 首招到期子流程 | 首招到期-存在在租租客协议 | 房源存在有效出房租约，定义为“租客续约/在租”，直接关单 command: end | 3ms | `end` | ✅ 通过 |
| `TC14_FR_FULL_SUCCESS` | 首招到期子流程 | 首招到期-全流程顺利起草成功 | 无协议冲突，资管明确同意，调用起草接口成功，群内通知起草成功进展，挂起 t+2 提醒 schedule | 5ms | `schedule` | ✅ 通过 |
| `TC15_FR_DRAFT_FAILED` | 首招到期子流程 | 首招到期-起草协议写接口异常 | 写接口调用失败严格执行 0 次重试，直接转人工服务管家 transfer_to_human | 4ms | `transfer_to_human` | ✅ 通过 |
| `TC16_ENT_SIGNED_AGREEMENT` | 委托到期子流程 | 委托到期-已有已签约解约协议 | 原收房合同已完成委托解约协议签署，发送致谢祝福及不合作原因回访，输出 command: end 办结关单 | 1ms | `end` | ✅ 通过 |
| `TC17_ENT_TENANT_DELIVERY_UNFINISHED` | 委托到期子流程 | 委托到期-租客退租交割未完成 | 租客交割未完成，私聊租务管家催办租客交割并提醒上传业主交割清单，command: null 挂起，阻断后续核查 | 3ms | null (挂起) | ✅ 通过 |
| `TC18_ENT_OWNER_DELIVERY_UNFINISHED` | 委托到期子流程 | 委托到期-租客交割已完但业主交割单未完成 | 租客交割已完成，但业主还房交割单未完成，私聊租务管家催办完成业主交割单，command: null 挂起 | 3ms | null (挂起) | ✅ 通过 |
| `TC19_ENT_HAS_DAMAGE` | 委托到期子流程 | 委托到期-交割清单检查存在物品损坏 | 交割清单中存在物品损坏，任务流程结束关单 command: end 并记录有物损，严禁起草协议 | 3ms | `end` | ✅ 通过 |
| `TC20_ENT_FULL_SUCCESS` | 委托到期子流程 | 委托到期-全流程顺利起草成功 | 无协议冲突，双交割已完无物损，资管同意起草，起草成功并通知业主进展，安排 t+2 提醒 schedule | 4ms | `schedule` | ✅ 通过 |
| `TC21_AM_NOT_CONTACTED` | 资管授权与多轮确认 | 资管确认-首次进入未联系 | 资管联系状态为未联系 (NOT_CONTACTED)，私聊发送初次咨询，重新查询获取下次追问时间并挂起 schedule | 3ms | `schedule` | ✅ 通过 |
| `TC22_AM_WAITING_REPLY` | 资管授权与多轮确认 | 资管确认-未回复阶梯追问 | 资管未回复且工具返回有效下次追问时间，私聊下发追问消息并挂起 schedule | 3ms | `schedule` | ✅ 通过 |
| `TC23_AM_REPLY_EXHAUSTED` | 资管授权与多轮确认 | 资管确认-3次追问耗尽关单 | 资管经3次追问仍未回复且查询工具确认追问耗尽 (nextContactAt=null)，定义为资管未回复结束工单 command: end | 6ms | `end` | ✅ 通过 |
| `TC24_AM_DECLINE_AND_REASON` | 资管授权与多轮确认 | 资管确认-暂不同意与原因追问 | 资管回复暂不同意 (DECLINE_DRAFT)，保存意图并私聊追问具体原因及是否稍后联系，command: null 挂起，不关单不转人工 | 4ms | null (挂起) | ✅ 通过 |
| `TC25_AM_CONTACT_LATER_MULTITURN` | 资管授权与多轮确认 | 资管确认-稍后联系多轮澄清闭环 | 资管回复稍后联系但未定时间 -> 追问具体时间；新一轮回复'明天上午10点确认' -> 结合上下文消歧补充时间 -> 保存意图并挂起 schedule 约定时间 | 3ms | `schedule` | ✅ 通过 |

---

## 二、分模块评测深度分析

### 1. 前置参数校验模块 (TC01 ~ TC03)
- **校验逻辑**: 当上游调度器缺失必填上下文（`orderId` / `contractCode` / `terminationType`）时，严格按规范阻断后续一切 Tool 调用，直接输出 `command: "transfer_to_human"`。
- **评测结论**: 100% 通过。严防了在缺少业务单号或合同号时产生脏数据或无效查询。

### 2. 意向查询与分流模块 (TC04 ~ TC07)
- **校验逻辑**: 严格依据 `query_owner_intention` 返回的意向枚举进行四分类决策：
  - 续约意向 (`RENEW`)、待确认 (`PENDING`/`UNKNOWN`)、资管自跟进 (`ASSET_MANAGER_FOLLOW`) 均以 `command: "end"` 退出自动化推进，并在 `reason` 中保留合理解释。
- **评测结论**: 100% 通过。业务互斥与自跟进场景严防误报转人工。

### 3. 解约类型业务分流模块 (TC08)
- **校验逻辑**: 当意向解约但类型为非本期支持场景（如“托管中途解约”）时，输出 `command: "end"` 提前结束。
- **评测结论**: 100% 通过。

### 4. 首招到期解约子流程 (TC09 ~ TC15)
- **校验逻辑**:
  - **防重核查**: 区分已签约办结 (`end` + 致谢回访) 与在途待签协议 (`end` 静默防重)；
  - **冲突排查**: 延长期变更、续约合同、在租租约层层排查，遇阻断均输出 `end` 并精确说明原因；
  - **全链路起草**: 资管同意后先调用 `save_asset_manager_authorization`，随后调用起草接口生成协议，返回 `command: "schedule"` 挂起 t+2 节点；
  - **0 重试防御**: 起草接口异常时严格 0 重试，转人工兜底。
- **评测结论**: 100% 通过。

### 5. 委托到期解约子流程 (TC16 ~ TC20)
- **校验逻辑**:
  - **双交割核验**: 租客交割未完时私聊租务并阻断业主交割单查询；业主交割单未完时催办业主单并阻断协议起草；
  - **物损强阻断**: 任一交割单有物损标签时，强制 `command: "end"` 关单，严禁进入资管授权或协议起草。
- **评测结论**: 100% 通过。

### 6. 资管授权与多轮确认子流程 (TC21 ~ TC25)
- **校验逻辑**:
  - 未联系 (`NOT_CONTACTED`) 与待回复 (`WAITING_REPLY`) 触发对应轮次私聊并读取下次联系时间挂起；
  - 3 次追问耗尽自动关单；
  - 暂不同意 (`DECLINE_DRAFT`) 不关单不转人工，追问原因；
  - 稍后联系支持跨轮次语义消歧与绝对时间归一化。
- **评测结论**: 100% 通过。

---

## 三、安全护栏与规范符合性认证

1. **统一返回值契约 (output-scheme.md)**: 所有用例最终 `Return({...})` 固定包含且仅包含 `command`、`nextScheduleAt`、`finalAnswer`、`reason` 四个顶层字段。
2. **私聊与群聊出口分离**: 催办/追问私聊严格通过 `contact_zuwu_and_asset_manager` 独立工具下发，`finalAnswer` 纯粹专职用于业主微信群通知，严禁泄露内部信息。
3. **写操作 0 次重试**: `draft_owner_termination_agreement` 失败时立即转人工服务管家，坚决杜绝因重复重试生成多份协议风险。
