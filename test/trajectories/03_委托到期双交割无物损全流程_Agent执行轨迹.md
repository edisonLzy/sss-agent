# Agent 执行轨迹：委托到期全流程顺利起草成功 (TC20)

- **场景名称**: 委托到期双交割验收完成、无物损、资管同意起草全流程
- **测试用例**: `TC20_ENT_FULL_SUCCESS`
- **执行角色**: Agent Runner
- **执行时间**: 2026-10-27 22:37:54 (Asia/Shanghai)
- **最终结果**: `PASS` (成功起草委托解约协议并安排 t+2 提醒)

---

## 一、输入上下文 (Runtime Fields)

```json
{
  "orderId": 88888,
  "contractCode": "TG20261024001",
  "terminationType": "委托到期",
  "executionId": 123,
  "sessionId": "session-test-020",
  "requestId": "req-test-020"
}
```

---

## 二、逐步执行推导与工具交互轨迹 (Step-by-Step Trajectory)

### 步骤 1：前置参数校验与意向确认
- **思考 (Thought)**:
  检查必填字段完整，调用 `query_owner_intention` 确认业主意向。
- **动作 (Action)**:
  `Call({ name: "query_owner_intention", payload: { orderId: 88888 } })`
- **工具返回 (Observation)**:
  `{ "errno": "0", "data": { "intention": "TERMINATE", "intentionDesc": "解约" } }`
- **推导决策 (Deduction)**:
  业主明确解约，且 `terminationType == "委托到期"`，加载 `references/entrusted-termination.md`。

---

### 步骤 2：解约防重与合同冲突排查
- **动作链**:
  1. `query_owner_termination_agreement` $\rightarrow$ `hasValidAgreement: false`（无解约协议，防重通过）；
  2. `query_owner_renewal_agreement` $\rightarrow$ `hasValidRenewal: false`（无续约合同，通过）；
  3. `query_tenant_contract` $\rightarrow$ `hasValidTenantContract: false`（无在租租约，通过）。

---

### 步骤 3：实体验收双交割单核查 (核心关键步骤)
- **3.1 租客解约交割单核查**:
  - **思考 (Thought)**: 委托到期首先核查上任租客退租交割单是否完成。
  - **动作 (Action)**:
    `Call({ name: "query_tenant_delivery_checklist", payload: { contractCode: "TG20261024001", orderId: 88888 } })`
  - **工具返回 (Observation)**:
    ```json
    {
      "errno": "0",
      "data": {
        "hasDeliveryOrder": true,
        "isDeliveryFinished": true,
        "deliveryStatusDesc": "已完成",
        "hasDamage": false,
        "canProceedTermination": true
      }
    }
    ```
  - **推导决策 (Deduction)**: 租客交割已完结且无物损，放行进入 4.2 业主交割单核查。

- **3.2 业主解约物业交割单（还房单）核查**:
  - **思考 (Thought)**: 查询省心租向业主交还房屋时交割单状态。
  - **动作 (Action)**:
    `Call({ name: "query_owner_delivery_checklist", payload: { contractCode: "TG20261024001", orderId: 88888 } })`
  - **工具返回 (Observation)**:
    ```json
    {
      "errno": "0",
      "data": {
        "hasDeliveryOrder": true,
        "isDeliveryFinished": true,
        "deliveryStatusDesc": "已完成",
        "hasDamage": false,
        "canProceedTermination": true,
        "zuwuManagerName": "张三",
        "zuwuManagerPhone": "13800138000"
      }
    }
    ```
  - **推导决策 (Deduction)**: 业主还房交割已完结且无损坏，放行进入资管授权。

---

### 步骤 4：资管授权与协议起草
- **资管查询**:
  `Call({ name: "query_asset_manager_authorization", payload: { executionId: 123 } })`
  $\rightarrow$ `authorization: "AGREE_DRAFT"`（资管明确同意起草）。
- **保存授权**:
  `Call({ name: "save_asset_manager_authorization", payload: { executionId: 123, authorization: "AGREE_DRAFT", reason: "资管已同意起草" } })`。
- **协议起草**:
  `Call({ name: "draft_owner_termination_agreement", payload: { contractId: "TG20261024001", type: "TERMINATION", reason: "委托到期自动发起解约流程" } })`
  $\rightarrow$ `agreementId: "AGR_DEFAULT_1001"`。

---

## 三、最终标准返回 (Return)

```json
Return({
  "command": "schedule",
  "nextScheduleAt": "2026-10-29T10:00:00+08:00",
  "finalAnswer": "@业主 您好，您的房屋委托到期解约协议已起草完成并提交办理，审核通过后请您留意关注协议查收与签署。",
  "reason": "解约协议起草成功，通知业主办理进展并安排 t+2 签约提醒"
})
```
