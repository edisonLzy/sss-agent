# Skill 实际执行自测

本次由当前 Codex 对话加载 `skill/SKILL.md`、两份 SOP 和三个资源文件，作为 Agent 逐步选择工具、读取 HTTP Mock 返回，再决定下一步和最终四字段输出。没有使用旧 `runner.ts` 中写死的业务工作流。

- 测试数据：[07_live_skill_cases.json](dataset/07_live_skill_cases.json)，92 个场景，包含 3 个有第二轮消息的接续场景，共 95 轮。
- 实际轨迹与结论：[本次报告](results/agent-run-20261028/REPORT.md)。每个用例 JSON 包含输入、工具参数、真实 Mock 响应、四字段输出和断言结果；多轮包含 `turnHistory` 和 `Resume`。
- 记录器：`agent-session.py` 只发送 Agent 指定的动作、隔离用例、落盘和校验结果，不做业务决策，也不调用模型。因此单独运行该脚本不会自动重新执行 Skill。
- `mock-server.ts` 补齐 `trigger_auto_termination`、`query_asset_manager_next_contact_time`，支持按用例隔离状态、错误注入、成功发送事实和虚拟时钟。

## 使用

```bash
PORT=18742 pnpm start
# 另一个终端：开始新执行（会重建本次目录中的用例记录）
python3 test/agent-session.py start
# Agent 加载 Skill 后，通过 act 传入明确的 Call/Return 动作，逐步查看返回再继续。
# act 参数是 JSON 数组；每个 Call 包含 id/name/payload，Return 包含 id/kind/output。
python3 test/agent-session.py status
# 重新校验已经落盘的轨迹，不会重新运行 Agent：
python3 test/agent-session.py recheck  # 当前保留4个失败用例，退出码为1
python3 test/agent-session.py report
# 独立检查Mock接口契约（不运行Agent）：
pnpm exec tsx test/interface-contracts.ts
```

用例的 `nextTurns` 定义模拟外部消息及事实更新；Agent 使用 `Resume` 读取该消息，随后从 Skill 入口重新核验。交割接续场景重新查询两份交割清单，不能仅凭“已经完成”的聊天文本直接起草。

业务时钟固定为 2026-10-28 10:00:00+08:00；所有 ID、合同与消息均为合成数据，不触及真实系统。Skill 文件哈希保存在 `skill-snapshot.json`，本次执行没有再修改 Skill。

## 验证边界

起草、时间查询模拟当前 Landlord 参数和 `ResponseResult.data` 返回；资管多意图保存/指定稍后时间/自定义私聊正文仍使用 Skill 目标契约 Mock。后者通过不能证明现有后端支持。未验证 KERA、真实 Dubbo、真实发送回执、真实定时唤醒或工单关闭。

本次同一个模型编写场景并执行，属于本地自测，不是独立模型评测。4 个时序用例失败被保留，报告中说明原因；没有通过改写 Skill 或放松断言消除失败。

旧的 `01`～`06` 数据集、`test/runner.ts`、旧报告与旧 `trajectories/` 保留作历史资料；它们包含旧起草工具和旧调度约定。`pnpm test` 目前仍调用这个历史手写流程，不能用于本次 Skill 行为结论。
