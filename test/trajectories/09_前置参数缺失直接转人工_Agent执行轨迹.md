# Agent 执行轨迹：前置参数缺失直接转人工 (TC01)

- **场景名称**: 安全护栏-前置参数缺失阻断转人工
- **测试用例**: `TC01_PARAM_MISSING_ORDER_ID`
- **执行角色**: Agent Runner (搭载 `owner-self-termination` Skill)
- **执行时间**: 2026-10-27 22:37:54 (Asia/Shanghai)
- **最终结果**: `PASS` (成功阻断后续所有操作，直接转人工管家核实)

---

## 一、输入上下文 (Runtime Fields)

```json
{
  "contractCode": "TG20261024001",
  "terminationType": "首招到期"
}
```
*(注：缺少关键必填业务参数 `orderId`)*

---

## 二、逐步执行推导与工具交互轨迹 (Step-by-Step Trajectory)

### 步骤 1：前置必填参数校验
- **思考 (Thought)**:
  按照主 SOP 规定，运行前必须校验三个系统上下文必填入参：
  1. `orderId`（协同单 ID）
  2. `contractCode`（收房合同编码）
  3. `terminationType`（解约类型）
  
  检查当前传入参数：
  - `contractCode`: "TG20261024001" (存在)
  - `terminationType`: "首招到期" (存在)
  - `orderId`: 未提供 (缺失)
- **动作 (Action)**:
  前置校验失败，直接熔断，坚决不发起任何外部接口请求（避免空单号查询造成脏数据或后端 1003 报错）。
- **推导决策 (Deduction)**:
  缺失核心业务主键 `orderId`，系统无法确定协同单上下文，触发前置防御兜底，输出 `command: "transfer_to_human"` 转人工服务管家排查。

---

## 三、最终决策与返回值 (Agent Return)

```json
{
  "command": "transfer_to_human",
  "nextScheduleAt": null,
  "finalAnswer": null,
  "reason": "前置校验失败：缺失必填运行参数（orderId/contractCode/terminationType），转人工服务管家核验"
}
```

- **验证核心点**:
  1. 0 工具调用（禁止向外调用任何 Tool）。
  2. 立即熔断并转人工，保障系统调用安全性与数据一致性。
