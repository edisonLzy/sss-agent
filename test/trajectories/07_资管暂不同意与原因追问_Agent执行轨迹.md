# Agent 执行轨迹：资管暂不同意与原因追问 (TC24)

- **场景名称**: 资管授权确认-暂不同意与追问闭环
- **测试用例**: `TC24_AM_DECLINE_AND_REASON`
- **执行角色**: Agent Runner (搭载 `owner-self-termination` Skill)
- **执行时间**: 2026-10-27 22:37:54 (Asia/Shanghai)
- **最终结果**: `PASS` (准确捕获暂不同意、记录意图、私聊追问原因、保持挂起不关单不转人工)

---

## 一、输入上下文 (Runtime Fields)

```json
{
  "orderId": 88888,
  "contractCode": "TG20261024001",
  "terminationType": "首招到期",
  "executionId": 123,
  "sessionId": "session-test-024",
  "requestId": "req-test-024"
}
```

---

## 二、逐步执行推导与工具交互轨迹 (Step-by-Step Trajectory)

### 步骤 1：意向确认
- **思考 (Thought)**:
  首招到期流程启动，先核查业主真实意向。
- **动作 (Action)**:
  `Call({ name: "query_owner_intention", payload: { orderId: 88888, sessionId: "session-test-024", requestId: "req-test-024" } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "errmsg": "success",
    "data": {
      "intention": "TERMINATE",
      "intentionDesc": "解约",
      "expectedHandoverTime": "2026-11-01"
    }
  }
  ```
- **推导决策 (Deduction)**: 业主意向明确为解约，进入首招到期前置排查流程。

---

### 步骤 2 ~ 5：前置四项无冲突校验
- **动作 (Actions)**:
  1. `query_owner_termination_agreement` $\rightarrow$ 无在途协议 (`hasValidAgreement: false`)
  2. `query_first_recruit_extension_agreement` $\rightarrow$ 无延长期 (`hasValidExtension: false`)
  3. `query_owner_renewal_agreement` $\rightarrow$ 无续约记录 (`hasValidRenewal: false`)
  4. `query_tenant_contract` $\rightarrow$ 租客已解约退租 (`tenantContractStatusDesc: "已解约"`)
- **推导决策 (Deduction)**: 合同与在租排查全部无冲突，满足前置条件，准备核查资管管家授权状态。

---

### 步骤 6：查询资管管家授权状态
- **思考 (Thought)**:
  调用 `query_asset_manager_authorization` 检查资管管家是否同意发起解约起草。
- **动作 (Action)**:
  `Call({ name: "query_asset_manager_authorization", payload: { executionId: 123, orderId: 88888, contractCode: "TG20261024001", sessionId: "session-test-024", requestId: "req-test-024" } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "errmsg": "success",
    "data": {
      "executionId": "123",
      "authorization": "DECLINE_DRAFT",
      "authorizationReason": "业主希望继续出租，暂不解约",
      "authorizationStatus": "INIT",
      "nextContactAt": null
    }
  }
  ```
- **推导决策 (Deduction)**:
  资管管家反馈为 `DECLINE_DRAFT` (暂不同意起草)，理由为“业主希望继续出租，暂不解约”。
  按照 Skill 规范：
  - **严禁直接关单 (`end`)**；
  - **严禁转人工 (`transfer_to_human`)**；
  - 必须调用 `save_asset_manager_authorization` 持久化资管意图；
  - 必须私聊资管追问具体原因及是否需要稍后联系。

---

### 步骤 7：持久化保存资管授权意图
- **思考 (Thought)**:
  保存状态为 `DECLINE_DRAFT`，保留管家填写的初始理由。
- **动作 (Action)**:
  `Call({ name: "save_asset_manager_authorization", payload: { executionId: 123, authorization: "DECLINE_DRAFT", reason: "业主希望继续出租，暂不解约", nextContactAt: null, sessionId: "session-test-024", requestId: "req-test-024" } })`
- **工具返回 (Observation)**:
  ```json
  { "errno": "0", "errmsg": "success", "data": { "success": true, "authorization": "DECLINE_DRAFT" } }
  ```

---

### 步骤 8：私聊追问具体原因与后续联系约定
- **思考 (Thought)**:
  通过私聊接口向资管管家发信澄清，不打扰业主群。
- **动作 (Action)**:
  `Call({ name: "contact_zuwu_and_asset_manager", payload: { executionId: 123, orderId: 88888, contractCode: "TG20261024001", target: "ASSET_MANAGER", contactReason: "确认暂不同意起草的原因及是否稍后联系", content: "收到，暂不发起起草。请问具体原因是什么？后续是否需要在指定时间再联系您确认？", sessionId: "session-test-024", requestId: "req-test-024" } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "errmsg": "success",
    "data": { "taskId": "TASK_1793111874646", "status": "ACCEPTED", "statusDesc": "已发送成功待回复" }
  }
  ```

---

## 三、最终决策与返回值 (Agent Return)

```json
{
  "command": null,
  "nextScheduleAt": null,
  "finalAnswer": null,
  "reason": "资管暂不同意起草，已追问原因及是否需要稍后联系，等待资管回复"
}
```

- **验证核心点**:
  1. `command: null` 挂起等待回复，避免误关单与误转人工。
  2. 私聊沟通专道流转，群聊无任何信息泄露（`finalAnswer: null`）。
