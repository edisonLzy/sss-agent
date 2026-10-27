# Agent 执行轨迹：资管3次追问耗尽关单闭环 (TC23)

- **场景名称**: 资管管家经 2h/4h/t+1 三次追问仍未回复，追问耗尽自动关单
- **测试用例**: `TC23_AM_REPLY_EXHAUSTED`
- **执行角色**: Agent Runner
- **执行时间**: 2026-10-27 22:37:54 (Asia/Shanghai)
- **最终结果**: `PASS` (成功识别追问耗尽，闭环结单，不无休止轮询)

---

## 一、输入上下文 (Runtime Fields)

```json
{
  "orderId": 88888,
  "contractCode": "TG20261024001",
  "terminationType": "首招到期",
  "executionId": 123,
  "sessionId": "session-test-023",
  "requestId": "req-test-023"
}
```

---

## 二、逐步执行推导与工具交互轨迹 (Step-by-Step Trajectory)

### 步骤 1：查询资管授权状态与下次追问时间
- **思考 (Thought)**:
  会话到达第 3 次追问到期时间唤醒，首先查询当前推进记录事实与工具计算的下次联系时间。
- **动作 (Action)**:
  `Call({ name: "query_asset_manager_authorization", payload: { executionId: 123, orderId: 88888, contractCode: "TG20261024001" } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "data": {
      "executionId": "123",
      "assetState": "WAITING_REPLY",
      "authorization": "UNKNOWN",
      "authorizationReason": "3次追问耗尽仍未回复",
      "nextContactAt": null
    }
  }
  ```
- **推导决策 (Deduction)**:
  状态为 `WAITING_REPLY`，但 `nextContactAt == null`。
  根据首招 SOP 步骤 3 决策分支 6 规定：
  > **`WAITING_REPLY` 且查询工具明确确认三次追问耗尽，`nextContactAt=null`：定义为“资管未回复”，结束工单。**
  不再下发私聊催办，输出 `command: "end"` 关单。

---

## 三、最终标准返回 (Return)

```json
Return({
  "command": "end",
  "nextScheduleAt": null,
  "finalAnswer": null,
  "reason": "资管经理经3次追问仍未回复，定义为资管未回复，结束本次工单"
})
```

---

## 四、安全护栏核验
- **防死循环**: 避免了因资管始终不回复导致系统无休止 `schedule` 轮询骚扰资管；
- **业务终态明确**: 明确定义“资管未回复”业务结单原因，便于工程侧与管理后台统一收口归档。
