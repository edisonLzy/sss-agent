# Agent 执行轨迹：起草协议写接口异常与转人工防御 (TC15)

- **场景名称**: 起草解约协议写操作接口微服务异常触发 0 次重试安全转人工
- **测试用例**: `TC15_FR_DRAFT_FAILED`
- **执行角色**: Agent Runner
- **执行时间**: 2026-10-27 22:37:54 (Asia/Shanghai)
- **最终结果**: `PASS` (遵守 0 次重试安全护栏，直接转人工管家)

---

## 一、输入上下文 (Runtime Fields)

```json
{
  "orderId": 88888,
  "contractCode": "TG20261024001",
  "terminationType": "首招到期",
  "executionId": 123,
  "sessionId": "session-test-015",
  "requestId": "req-test-015"
}
```

---

## 二、逐步执行推导与工具交互轨迹 (Step-by-Step Trajectory)

### 步骤 1：前置各环节排查全部通过
- 意向确认 `TERMINATE`；
- 无在途解约协议、无延长期协议、无续约合同、无在租租约；
- 资管已同意起草并已保存授权意图。

---

### 步骤 2：调用起草协议写接口
- **思考 (Thought)**:
  所有准入条件均满足，向合同系统发起起草解约协议。
- **动作 (Action)**:
  `Call({ name: "draft_owner_termination_agreement", payload: { contractId: "TG20261024001", type: "TERMINATION", reason: "首招到期自动发起解约流程" } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "1004",
    "errmsg": "合同系统网络异常，解约协议起草超时",
    "error": "合同系统网络异常，解约协议起草超时",
    "data": null
  }
  ```
- **推导决策 (Deduction)**:
  接口返回错误码 `1004`。
  根据 Skill【安全护栏】第一条规定：
  > **写操作具备幂等风险：调用失败严格禁止自动重试（0 次重试），必须立即输出 `command: "transfer_to_human"` 转人工服务管家排查，严禁重复生成协议。**
  同时通过 `finalAnswer` 提供业主群安抚文案。

---

## 三、最终标准返回 (Return)

```json
Return({
  "command": "transfer_to_human",
  "nextScheduleAt": null,
  "finalAnswer": "@业主 您好，系统办理过程中出现微小异常，已为您转接人工服务管家跟进处理，请稍候。",
  "reason": "调用接口起草业主解约协议未成功，转人工服务管家线下起草"
})
```

---

## 四、安全护栏核验
- **重试控制**: 写操作调用次数严格控制在 **1 次**，0 次自动重试，杜绝合同重复生成隐患；
- **安抚话术**: 群内下发专业管家安抚话术，不向业主暴露底层微服务超时技术报错。
