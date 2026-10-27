# Agent 执行轨迹：委托到期交割物损阻断 (TC19)

- **场景名称**: 委托到期实体验收核查发现物品损坏强阻断
- **测试用例**: `TC19_ENT_HAS_DAMAGE`
- **执行角色**: Agent Runner
- **执行时间**: 2026-10-27 22:37:54 (Asia/Shanghai)
- **最终结果**: `PASS` (成功识别物损并关单，坚决阻断协议起草)

---

## 一、输入上下文 (Runtime Fields)

```json
{
  "orderId": 88888,
  "contractCode": "TG20261024001",
  "terminationType": "委托到期",
  "sessionId": "session-test-019",
  "requestId": "req-test-019"
}
```

---

## 二、逐步执行推导与工具交互轨迹 (Step-by-Step Trajectory)

### 步骤 1：前置合同与协议核验通过
- **动作链**:
  1. `query_owner_intention` $\rightarrow$ `intention: "TERMINATE"`；
  2. `query_owner_termination_agreement` $\rightarrow$ `hasValidAgreement: false`；
  3. `query_owner_renewal_agreement` $\rightarrow$ `hasValidRenewal: false`；
  4. `query_tenant_contract` $\rightarrow$ `hasValidTenantContract: false`。

---

### 步骤 2：租客退租交割清单核查
- **思考 (Thought)**:
  核查上任租客退租交割单物品状态。
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
      "hasDamage": true,
      "damageDescList": [
        "客厅-电视机：屏幕破碎损坏"
      ],
      "canProceedTermination": false
    }
  }
  ```
- **推导决策 (Deduction)**:
  发现 `hasDamage == true`，存在物品损坏（“客厅-电视机：屏幕破碎损坏”）。
  根据委托到期 SOP 步骤 4.3 规定：**存在物损时，属于实体验收未满足自动化条件，任务流程结束关单并记录“有物损”，严禁进入资管授权或发起起草协议**。

---

## 三、最终标准返回 (Return)

```json
Return({
  "command": "end",
  "nextScheduleAt": null,
  "finalAnswer": null,
  "reason": "交割清单检查存在物品损坏，任务流程结束关单，记录有物损"
})
```

---

## 四、安全护栏核验
- **写操作防御**: 坚决没有触发 `draft_owner_termination_agreement`（写操作调用次数严格为 0）；
- **资管免打扰**: 未向资管发送任何起草授权骚扰消息；
- **指令规范**: 输出 `command: "end"`，由工程侧统一记录物损并结单，避免误转人工。
