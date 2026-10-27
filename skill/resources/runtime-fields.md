# 运行时字段

本文件统一定义上游系统触发当前 Skill 时注入的外部运行时字段、引用方式及使用规则，适用于 `SKILL.md` 和各 `references/` 子流程。

## 字段定义

| 字段 | 类型 | 必填 | 业务含义与说明 | 取值示例 / 约束 |
| :--- | :--- | :---: | :--- | :--- |
| `orderId` | Long | 是 | 续解业务协同工单 ID，用于关联业务工单、查询业主意向及全流程串联 | `12345678` |
| `contractCode` | String | 是 | 业主原收房合同编号（托管合同编号），用于协议防重与交割查询 | `"TG20261024001"` |
| `contractId` | Long | 是 | 业主原收房合同主键 ID，由上游注入，用于触发合同自动解约起草 | `123456789`，大于 0；与 `contractCode` 分别提供，不得用合同编号代替 |
| `terminationType` | String | 是 | 上游传入的解约类型描述 | `"首招到期"`、`"委托到期"` |
| `backDate` | Date | 起草时必填 | 上游按合同 DTO 提供的还房日，模型原样透传 | 统一业务时区 `Asia/Shanghai` 当天零点；实际表示由工具实现按 SDK 提供，不从当前日期或首招基准日猜测 |
| `executionId` | Long | 否 | 业主解约推进事实记录 ID（对应 `owner_termination_execution.id`），有值时优先用于查询资管授权推进状态与催办租务资管 | `123` |
| `sessionId` | String | 否 | 会话链路追踪 ID，用于日志排查与追踪；有值时原样透传给各工具 | `"session-agent-001"` |
| `requestId` | String | 否 | 请求链路追踪 ID，用于日志排查与追踪；有值时原样透传给各工具 | `"req-agent-001"` |

## 字段引用方式

所有由外部上游系统注入的变量统一放置在 `fields` 作用域下。在工作流程、条件判断、工具调用参数及返回值中引用这些字段时，必须使用 `{{fields.xxx}}` 模板语法。例如：

```text
Call({
  name: "query_owner_intention",
  payload: {
    orderId: {{fields.orderId}},
    sessionId: {{fields.sessionId}},
    requestId: {{fields.requestId}}
  }
})
```

## 使用规则与约束

1. **严格只读**：运行时字段由系统注入，执行期间为只读常量，不得修改或覆盖 `fields` 下的值。
2. **严禁编造**：不得自行猜测、篡改或凭空生成任何字段值，也不得将文档中的示例值用作真实业务参数。
3. **缺失即阻断**：前置校验发现必填字段 `orderId`、`contractCode`、`contractId` 或 `terminationType` 缺失或为空时，必须立即通过 `Return(...)` 终止本次流程并说明缺失字段，不得继续调用工具；返回结构遵循 [output-scheme.md](output-scheme.md)。
4. **可选字段透传**：`sessionId`、`requestId` 有值时原样透传；缺失时不编造补齐，按工具契约省略对应可选参数。
5. **合同类型映射**：`fields.terminationType` 保留只读业务描述；调用合同触发工具时，委托到期映射 `terminationType: 1`，首招到期映射 `terminationType: 7`。不改写运行时字段，也不把 Landlord 本地类型 `2` 传给合同接口。
6. **还房日校验时点**：发起起草前检查 `backDate` 是否已由上游按合同 DTO 提供；缺失时不调用写接口，返回 `transfer_to_human` 并说明缺失信息。业务日期是否合法交由合同侧校验，模型不转换或改写日期。
