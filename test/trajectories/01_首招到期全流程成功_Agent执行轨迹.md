# Agent 执行轨迹：首招到期全流程顺利起草成功 (TC14)

- **场景名称**: 首招到期自动化解约起草全流程闭环
- **测试用例**: `TC14_FR_FULL_SUCCESS`
- **执行角色**: Agent Runner (搭载 `owner-self-termination` Skill)
- **执行时间**: 2026-10-27 22:37:54 (Asia/Shanghai)
- **最终结果**: `PASS` (成功起草解约协议并安排 t+2 提醒)

---

## 一、输入上下文 (Runtime Fields)

```json
{
  "orderId": 88888,
  "contractCode": "TG20261024001",
  "terminationType": "首招到期",
  "executionId": 123,
  "sessionId": "session-test-014",
  "requestId": "req-test-014"
}
```

---

## 二、逐步执行推导与工具交互轨迹 (Step-by-Step Trajectory)

### 步骤 1：前置必填参数校验
- **思考 (Thought)**:
  检查由宿主环境注入的必填字段 `orderId`, `contractCode`, `terminationType`。
  当前字段均存在且非空，前置校验通过，准备进入业务流转。
- **动作 (Action)**: 本地校验通过，无外部网络请求。

---

### 步骤 2：意向排查与业务类型分流
- **思考 (Thought)**:
  需要先确认当前业务工单中业主的真实意向。按照主 SOP 调用 `query_owner_intention` 工具。
- **动作 (Action)**:
  `Call({ name: "query_owner_intention", payload: { orderId: 88888, sessionId: "session-test-014", requestId: "req-test-014" } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "errmsg": "success",
    "data": {
      "intention": "TERMINATE",
      "intentionDesc": "解约",
      "expectedHandoverTime": "2026-11-01",
      "expectedHandoverTimeDesc": "指定日期"
    }
  }
  ```
- **推导决策 (Deduction)**:
  业主明确解约 (`intention == "TERMINATE"`)，且 `terminationType == "首招到期"`，按规则加载 `references/first-recruit-termination.md` 进入首招到期子流程。

---

### 步骤 3：解约协议防重核查
- **思考 (Thought)**:
  在起草任何协议前，必须先探查原收房合同当前是否已经存在有效解约协议，避免重复发起。
- **动作 (Action)**:
  `Call({ name: "query_owner_termination_agreement", payload: { contractCode: "TG20261024001", orderId: 88888 } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "data": {
      "hasValidAgreement": false,
      "isSigned": false,
      "agreementStatusDesc": "",
      "agreementCode": null
    }
  }
  ```
- **推导决策 (Deduction)**:
  无有效解约协议 (`hasValidAgreement == false`)，防重检查通过，进入步骤 2 合同与延长期冲突排查。

---

### 步骤 4：冲突排查 2.1 - 首招延长期排查
- **思考 (Thought)**:
  排查收房合同是否存在已生效或正在办理的首招延长期变更协议。
- **动作 (Action)**:
  `Call({ name: "query_first_recruit_extension_agreement", payload: { contractCode: "TG20261024001", orderId: 88888 } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "data": {
      "hasValidExtension": false,
      "isConfirmed": false,
      "extensionStatusDesc": "无延长期记录"
    }
  }
  ```
- **推导决策 (Deduction)**:
  无延长期协议 (`hasValidExtension == false`)，放行进入 2.2 业主续约合同排查。

---

### 步骤 5：冲突排查 2.2 - 业主续约合同排查
- **思考 (Thought)**:
  排查收房合同是否已经发起续约合同。
- **动作 (Action)**:
  `Call({ name: "query_owner_renewal_agreement", payload: { contractCode: "TG20261024001", orderId: 88888 } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "data": {
      "hasValidRenewal": false,
      "isSigned": false,
      "renewalContractCode": null
    }
  }
  ```
- **推导决策 (Deduction)**:
  无续约合同 (`hasValidRenewal == false`)，放行进入 2.3 租客在租租赁协议排查。

---

### 步骤 6：冲突排查 2.3 - 租客在租租赁协议排查
- **思考 (Thought)**:
  排查该房源当前是否有生效中的租客出租合同。
- **动作 (Action)**:
  `Call({ name: "query_tenant_contract", payload: { contractCode: "TG20261024001", orderId: 88888 } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "data": {
      "hasValidTenantContract": false,
      "isSigned": false,
      "tenantContractStatusDesc": "已解约"
    }
  }
  ```
- **推导决策 (Deduction)**:
  无在租租客合同 (`hasValidTenantContract == false`)，前置冲突全部排查通过，进入步骤 3 资管授权确认。

---

### 步骤 7：资管授权确认查询
- **思考 (Thought)**:
  查询负责该合同的资管管家是否同意发起解约协议。
- **动作 (Action)**:
  `Call({ name: "query_asset_manager_authorization", payload: { executionId: 123, orderId: 88888, contractCode: "TG20261024001" } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "data": {
      "executionId": "123",
      "assetState": "AGREED",
      "authorization": "AGREE_DRAFT",
      "authorizationReason": "资管已同意起草",
      "nextContactAt": null
    }
  }
  ```
- **推导决策 (Deduction)**:
  资管明确同意起草 (`authorization == "AGREE_DRAFT"`)。根据 SOP，先调用 `save_asset_manager_authorization` 保存意图，成功后继续起草，不在本步骤 Return。

---

### 步骤 8：保存资管授权意图
- **思考 (Thought)**:
  在调用写接口前，将识别到的资管授权结论回填并固化。
- **动作 (Action)**:
  `Call({ name: "save_asset_manager_authorization", payload: { executionId: 123, authorization: "AGREE_DRAFT", reason: "资管已同意起草", nextContactAt: null } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "data": {
      "success": true,
      "executionId": "123",
      "authorization": "AGREE_DRAFT"
    }
  }
  ```
- **推导决策 (Deduction)**:
  保存成功，进入步骤 4 发起起草协议。

---

### 步骤 9：发起起草业主解约协议（写操作）
- **思考 (Thought)**:
  所有准入条件均已严格满足，调用合同系统接口起草协议。注意遵守 0 次重试安全护栏。
- **动作 (Action)**:
  `Call({ name: "draft_owner_termination_agreement", payload: { contractId: "TG20261024001", type: "TERMINATION", reason: "首招到期自动发起解约流程" } })`
- **工具返回 (Observation)**:
  ```json
  {
    "errno": "0",
    "data": {
      "agreementId": "AGR_SZ_20261027001"
    }
  }
  ```
- **推导决策 (Deduction)**:
  协议起草成功，生成有效协议 ID `AGR_SZ_20261027001`。
  根据 SOP，通过 `finalAnswer` 向业主群播报进展，输出 `command: "schedule"` 并安排 t+2 提醒。

---

## 三、最终标准返回 (Return)

```json
Return({
  "command": "schedule",
  "nextScheduleAt": "2026-10-29T10:00:00+08:00",
  "finalAnswer": "@业主 您好，您的房屋首招到期解约协议已起草完成并提交办理，审核通过后请您留意关注协议查收与签署。",
  "reason": "首招解约协议起草成功，通知业主办理进展并安排 t+2 签约提醒"
})
```

---

## 四、契约合规性评估
1. **顶层字段**: 严格输出 `command`、`nextScheduleAt`、`finalAnswer`、`reason`，无冗余字段；
2. **命令合法性**: `schedule` 为合法指令；
3. **调度时间戳**: 符合 ISO 8601 带时区绝对时间（t+2 时刻）；
4. **群聊出口隔离**: `finalAnswer` 专职服务群通知，无内部调试泄漏。
