# Agent 执行轨迹：资管多轮澄清与追问场景 (TC25 & Thread 01a17d8f)

- **场景名称**: 资管授权确认跨轮次上下文消歧与时间补充全流程
- **测试用例**: `TC25_AM_CONTACT_LATER_MULTITURN` (对应讨论线程 `codex://threads/01a17d8f-7144-72e3-9b68-e29d90669510`)
- **执行角色**: Agent Runner
- **执行特点**: 跨越 4 轮交互，展示大模型在 `command: null` 挂起与调度唤醒下的多轮上下文理解能力

---

## 一、交互全景时间轴 (Timeline)

```text
[轮次 1 (T0)]        未联系 (NOT_CONTACTED) -> 私聊咨询 -> schedule 挂起等待回复
      ↓
[轮次 2 (T0+10m)]    资管私聊回复：“先稍后联系吧，我手头有点事”
                     -> 意图识别 CONTACT_LATER（时间未定）
                     -> 保存意图 -> 追问具体联系时间 -> command: null 挂起
      ↓
[轮次 3 (T0+15m)]    资管私聊回复：“明天上午10点确认”
                     -> 上下文消歧：答复上轮时间询问
                     -> 归一化为 2026-10-28T10:00:00+08:00
                     -> 保存约定时间 -> schedule 约定时间挂起
      ↓
[轮次 4 (T0+1d 10:00)] 到期调度唤醒，资管回复：“发吧，可以起草”
                     -> 明确同意 AGREE_DRAFT -> 起草协议成功 -> schedule t+2 提醒
```

---

## 二、逐轮详细执行推导与工具交互轨迹

### 【第 1 轮】：初次进入步骤 3/5，资管未联系

- **输入状态**:
  - `fields.executionId`: 123
  - 工具查询返回: `assetState: "NOT_CONTACTED"`, `authorization: "UNKNOWN"`, `nextContactAt: "2026-10-27T16:00:00+08:00"`
- **思考 (Thought)**:
  资管联系状态为未联系，且当前是初次进入该步骤。根据 SOP 规则，不能直接转人工或擅自起草，应调用联系工具向资管发起初次私聊咨询，并依据工具给出的下次联系时间挂起调度。
- **工具调用 1**:
  `Call({ name: "contact_zuwu_and_asset_manager", payload: { executionId: 123, target: "ASSET_MANAGER", contactReason: "咨询首招到期是否同意起草解约协议", content: "资管经理您好，该房屋首招到期，相关前置排查已通过，请问是否同意起草解约协议？审核通过后将按流程发送业主签约。" } })`
- **工具返回 1**:
  `{ "status": "ACCEPTED", "statusDesc": "已发送成功待回复" }`
- **工具调用 2 (刷新时间)**:
  `Call({ name: "query_asset_manager_authorization", payload: { executionId: 123 } })`
- **第 1 轮输出 (Return)**:
  ```json
  Return({
    "command": "schedule",
    "nextScheduleAt": "2026-10-27T16:00:00+08:00",
    "finalAnswer": null,
    "reason": "等待资管回复"
  })
  ```

---

### 【第 2 轮】：资管回复“稍后再联系”（时间未明确）

- **新增外部消息**:
  资管私聊消息追加到上下文: *“先稍后再联系吧，我手头有点事”*
- **思考 (Thought)**:
  1. 资管意图明确倾向于“稍后联系”（`authorization = "CONTACT_LATER"`）；
  2. 但消息中未提及具体日期与时间点（如明天几点、某日等）；
  3. 命中 SOP 的“联系时间未明确”分支：必须先保存 `CONTACT_LATER`（时间留空 `null`），再私聊追问具体联系时间，随后输出 `command: null` 静默挂起。
- **工具调用 1 (保存意图)**:
  `Call({ name: "save_asset_manager_authorization", payload: { executionId: 123, authorization: "CONTACT_LATER", reason: "资管回复：先稍后再联系吧，我手头有点事", nextContactAt: null } })`
- **工具返回 1**:
  `{ "success": true, "authorization": "CONTACT_LATER", "nextContactAt": null }`
- **工具调用 2 (追问具体时间)**:
  `Call({ name: "contact_zuwu_and_asset_manager", payload: { executionId: 123, target: "ASSET_MANAGER", contactReason: "确认资管要求稍后联系的具体时间", content: "好的，请问您希望在哪一天、几点再次联系您确认？" } })`
- **工具返回 2**:
  `{ "status": "ACCEPTED" }`
- **第 2 轮输出 (Return)**:
  ```json
  Return({
    "command": null,
    "nextScheduleAt": null,
    "finalAnswer": null,
    "reason": "资管要求稍后联系，但未明确联系时间，已追问并等待回复"
  })
  ```

---

### 【第 3 轮】：资管回复“明天上午10点确认”（上下文消歧核心）

- **新增外部消息**:
  资管私聊消息追加到上下文: *“明天上午10点确认”*
- **思考 (Thought)**:
  1. **跨轮次消歧**: 上一轮 Agent 问的是“请问您希望在哪一天、几点再次联系您确认？”，当前资管答复“明天上午10点确认”，这是对联系时间的明确补充，**绝对不能当成一条孤立、无法识别的回复**；
  2. **时间归一化**: 业务基准日期为 2026-10-27，明天的上午 10:00 归一化为带时区的绝对时间戳 `2026-10-28T10:00:00+08:00`；
  3. **命中分支**: 命中“稍后联系且联系时间明确”分支，保存意图与时间，输出 `command: "schedule"`。
- **工具调用 1 (保存明确时间)**:
  `Call({ name: "save_asset_manager_authorization", payload: { executionId: 123, authorization: "CONTACT_LATER", reason: "资管明确约定联系时间：明天上午10点确认", nextContactAt: "2026-10-28T10:00:00+08:00" } })`
- **工具返回 1**:
  `{ "success": true, "nextContactAt": "2026-10-28T10:00:00+08:00" }`
- **第 3 轮输出 (Return)**:
  ```json
  Return({
    "command": "schedule",
    "nextScheduleAt": "2026-10-28T10:00:00+08:00",
    "finalAnswer": null,
    "reason": "资管要求稍后联系，按约定时间再次确认"
  })
  ```

---

### 【第 4 轮】：约定时间到达唤醒，资管同意起草

- **触发事件**:
  系统到达约定时间 `2026-10-28T10:00:00+08:00`，会话恢复唤醒。资管确认私聊回复: *“发吧，可以起草”*。
- **思考 (Thought)**:
  1. 资管回复“发吧，可以起草”，识别为明确同意 `authorization: "AGREE_DRAFT"`；
  2. 先调用保存工具保存意图；
  3. 保存成功后进入步骤 4，调用 `draft_owner_termination_agreement` 起草解约协议；
  4. 起草成功后，输出 `command: "schedule"`，安排 t+2 提醒并群内播报。
- **工具调用 1 (保存同意授权)**:
  `Call({ name: "save_asset_manager_authorization", payload: { executionId: 123, authorization: "AGREE_DRAFT", reason: "资管明确回复：发吧，可以起草", nextContactAt: null } })`
- **工具调用 2 (起草协议)**:
  `Call({ name: "draft_owner_termination_agreement", payload: { contractId: "TG20261024001", type: "TERMINATION", reason: "首招到期自动发起解约流程" } })`
- **工具返回 2**:
  `{ "errno": "0", "data": { "agreementId": "AGR_SZ_20261027001" } }`
- **第 4 轮输出 (Return)**:
  ```json
  Return({
    "command": "schedule",
    "nextScheduleAt": "2026-10-30T10:00:00+08:00",
    "finalAnswer": "@业主 您好，您的房屋首招到期解约协议已起草完成并提交办理，审核通过后请您留意关注协议查收与签署。",
    "reason": "首招解约协议起草成功，通知业主办理进展并安排 t+2 签约提醒"
  })
  ```

---

## 三、评测结论
- **会话挂起有效性**: 通过 `command: null` 与 `command: "schedule"` 成功保证流程处于中间态而不被工程侧误关单；
- **多轮语义对齐**: 准确捕捉后置补充信息，消除了单轮独立判断容易造成的意图误识别问题。
