# 当前 Codex 加载 Skill 的实际执行记录

执行方式：当前对话中的 Codex 读取六份 Skill 文件，逐步选择 Call，查看实际 HTTP Mock 响应后继续或 Return。agent-session.py 只运输和记录动作、在 Return 后断言，不包含业务执行流程；没有调用旧 test/runner.ts。

虚拟业务时间：2026-10-28 10:00:00+08:00。所有合同、工单、消息均为合成 Mock，无真实系统副作用。

目标契约 Mock：save_asset_manager_authorization 的多意图/nextContactAt，以及联系工具自定义 content 是 Skill 目标契约，尚不能据此证明现有后端支持；起草、时间查询按当前 Landlord 形状模拟。

| 用例 | 场景 | 结果 | command | 调用数 |
| --- | --- | --- | --- | --- |
| [FR_AGREEMENT_EMPTY](FR_AGREEMENT_EMPTY.json) | 协议查询 AGREEMENT_EMPTY | 通过 | `"transfer_to_human"` | 2 |
| [FR_AGREEMENT_False](FR_AGREEMENT_False.json) | 已有有效解约协议 | 通过 | `"end"` | 2 |
| [FR_AGREEMENT_True](FR_AGREEMENT_True.json) | 已有有效解约协议 | 通过 | `"end"` | 2 |
| [FR_AM_AGREE](FR_AM_AGREE.json) | 资管回复 AGREE | 通过 | `null` | 8 |
| [FR_AM_DECLINE](FR_AM_DECLINE.json) | 资管回复 DECLINE | 通过 | `null` | 8 |
| [FR_AM_DECLINE_REASON](FR_AM_DECLINE_REASON.json) | 资管回复 DECLINE_REASON | 通过 | `null` | 8 |
| [FR_AM_EXHAUSTED](FR_AM_EXHAUSTED.json) | 资管联系 EXHAUSTED | 通过 | `"end"` | 8 |
| [FR_AM_FOLLOW](FR_AM_FOLLOW.json) | 资管回复 FOLLOW | 通过 | `"end"` | 7 |
| [FR_AM_INIT](FR_AM_INIT.json) | 资管联系 INIT | 通过 | `"schedule"` | 8 |
| [FR_AM_LATER_TIME](FR_AM_LATER_TIME.json) | 资管回复 LATER_TIME | 通过 | `"schedule"` | 7 |
| [FR_AM_LATER_UNKNOWN](FR_AM_LATER_UNKNOWN.json) | 资管回复 LATER_UNKNOWN | 通过 | `"schedule"` | 9 |
| [FR_AM_REMIND1](FR_AM_REMIND1.json) | 资管联系 REMIND1 | 通过 | `"schedule"` | 8 |
| [FR_AM_REMIND2](FR_AM_REMIND2.json) | 资管联系 REMIND2 | 通过 | `"schedule"` | 8 |
| [FR_AM_REMIND3](FR_AM_REMIND3.json) | 资管联系 REMIND3 | 通过 | `"end"` | 8 |
| [FR_AM_UNCLEAR](FR_AM_UNCLEAR.json) | 资管回复 UNCLEAR | 通过 | `null` | 15 |
| [FR_BACKDATE_FORMAT](FR_BACKDATE_FORMAT.json) | 还房日 FORMAT | 通过 | `"transfer_to_human"` | 6 |
| [FR_BACKDATE_MISSING](FR_BACKDATE_MISSING.json) | 还房日 MISSING | 通过 | `"transfer_to_human"` | 6 |
| [FR_CONTACT_ACCEPTED](FR_CONTACT_ACCEPTED.json) | 私聊仅受理，等待回执 | 通过 | `null` | 7 |
| [FR_CONTACT_FAILED](FR_CONTACT_FAILED.json) | 私聊写失败不重试 | 通过 | `"transfer_to_human"` | 7 |
| [FR_DRAFT_ACCEPTED](FR_DRAFT_ACCEPTED.json) | 已受理但无协议ID | 通过 | `null` | 7 |
| [FR_DRAFT_EMPTY](FR_DRAFT_EMPTY.json) | 起草非法响应 EMPTY | 通过 | `"transfer_to_human"` | 7 |
| [FR_DRAFT_ERROR_1004](FR_DRAFT_ERROR_1004.json) | 起草异常 1004 | 通过 | `"transfer_to_human"` | 7 |
| [FR_DRAFT_ERROR_1007](FR_DRAFT_ERROR_1007.json) | 起草异常 1007 | 通过 | `"end"` | 7 |
| [FR_DRAFT_ERROR_501](FR_DRAFT_ERROR_501.json) | 起草异常 501 | 通过 | `"transfer_to_human"` | 7 |
| [FR_DRAFT_NO_ID](FR_DRAFT_NO_ID.json) | 起草非法响应 NO_ID | 通过 | `"transfer_to_human"` | 7 |
| [FR_DRAFT_STATUS_1](FR_DRAFT_STATUS_1.json) | 起草状态 1 | 通过 | `null` | 7 |
| [FR_DRAFT_STATUS_2](FR_DRAFT_STATUS_2.json) | 起草状态 2 | 通过 | `null` | 7 |
| [FR_DRAFT_STATUS_3](FR_DRAFT_STATUS_3.json) | 起草状态 3 | 通过 | `"end"` | 7 |
| [FR_DRAFT_STATUS_4](FR_DRAFT_STATUS_4.json) | 起草状态 4 | 通过 | `"end"` | 7 |
| [FR_DRAFT_UNKNOWN_STATUS](FR_DRAFT_UNKNOWN_STATUS.json) | 起草非法响应 UNKNOWN_STATUS | 通过 | `"transfer_to_human"` | 7 |
| [FR_EXTENSION](FR_EXTENSION.json) | 有效首招延长期 | 通过 | `"end"` | 3 |
| [FR_READ_TIMEOUT](FR_READ_TIMEOUT.json) | 协议查询 READ_TIMEOUT | 通过 | `"transfer_to_human"` | 3 |
| [FR_RENEWAL](FR_RENEWAL.json) | 有效续约 | 通过 | `"end"` | 4 |
| [FR_SAVE_FAILED](FR_SAVE_FAILED.json) | 意图保存写失败不继续起草 | 通过 | `"transfer_to_human"` | 7 |
| [FR_TENANT](FR_TENANT.json) | 有效租约 | 通过 | `"end"` | 5 |
| [INTENT_ASSET_MANAGER_FOLLOW](INTENT_ASSET_MANAGER_FOLLOW.json) | 业主意向 ASSET_MANAGER_FOLLOW | 通过 | `"end"` | 1 |
| [INTENT_PENDING](INTENT_PENDING.json) | 业主意向 PENDING | 通过 | `"end"` | 1 |
| [INTENT_RENEW](INTENT_RENEW.json) | 业主意向 RENEW | 通过 | `"end"` | 1 |
| [INTENT_UNKNOWN](INTENT_UNKNOWN.json) | 业主意向 UNKNOWN | 通过 | `"end"` | 1 |
| [PARAM_ID_CODE](PARAM_ID_CODE.json) | 非法 contractId | 通过 | `"transfer_to_human"` | 0 |
| [PARAM_ID_NEGATIVE](PARAM_ID_NEGATIVE.json) | 非法 contractId | 通过 | `"transfer_to_human"` | 0 |
| [PARAM_ID_ZERO](PARAM_ID_ZERO.json) | 非法 contractId | 通过 | `"transfer_to_human"` | 0 |
| [PARAM_contractCode](PARAM_contractCode.json) | 缺少 contractCode | 通过 | `"transfer_to_human"` | 0 |
| [PARAM_contractId](PARAM_contractId.json) | 缺少 contractId | 通过 | `"transfer_to_human"` | 0 |
| [PARAM_orderId](PARAM_orderId.json) | 缺少 orderId | 通过 | `"transfer_to_human"` | 0 |
| [PARAM_terminationType](PARAM_terminationType.json) | 缺少 terminationType | 通过 | `"transfer_to_human"` | 0 |
| [TIME_ERROR](TIME_ERROR.json) | 时间响应 ERROR | 通过 | `"transfer_to_human"` | 9 |
| [TIME_MISSING_COUNT](TIME_MISSING_COUNT.json) | 时间响应 MISSING_COUNT | 通过 | `"transfer_to_human"` | 8 |
| [TIME_NO_EXECUTION](TIME_NO_EXECUTION.json) | 运行时无executionId，从授权查询回查真实记录ID（不能用orderId代替） | 通过 | `"schedule"` | 8 |
| [TIME_NULL_NOT_EXHAUSTED](TIME_NULL_NOT_EXHAUSTED.json) | 时间响应 NULL_NOT_EXHAUSTED | 通过 | `"transfer_to_human"` | 8 |
| [TIME_PAST](TIME_PAST.json) | 时间响应 PAST | 通过 | `"transfer_to_human"` | 8 |
| [TYPE_11](TYPE_11.json) | 托管中途解约 | 通过 | `"end"` | 1 |
| [TYPE_12](TYPE_12.json) | 首次招租中途解约 | 通过 | `"end"` | 1 |
| [TYPE_13](TYPE_13.json) | 未识别类型 | 通过 | `"end"` | 1 |
| [WT_AGREEMENT_EMPTY](WT_AGREEMENT_EMPTY.json) | 协议查询 AGREEMENT_EMPTY | 通过 | `"transfer_to_human"` | 2 |
| [WT_AGREEMENT_False](WT_AGREEMENT_False.json) | 已有有效解约协议 | 通过 | `"end"` | 2 |
| [WT_AGREEMENT_True](WT_AGREEMENT_True.json) | 已有有效解约协议 | 通过 | `"end"` | 2 |
| [WT_AM_AGREE](WT_AM_AGREE.json) | 资管回复 AGREE | 通过 | `null` | 9 |
| [WT_AM_DECLINE](WT_AM_DECLINE.json) | 资管回复 DECLINE | 通过 | `null` | 9 |
| [WT_AM_DECLINE_REASON](WT_AM_DECLINE_REASON.json) | 资管回复 DECLINE_REASON | 通过 | `null` | 9 |
| [WT_AM_EXHAUSTED](WT_AM_EXHAUSTED.json) | 资管联系 EXHAUSTED | 通过 | `"end"` | 9 |
| [WT_AM_FOLLOW](WT_AM_FOLLOW.json) | 资管回复 FOLLOW | 通过 | `"end"` | 8 |
| [WT_AM_INIT](WT_AM_INIT.json) | 资管联系 INIT | 通过 | `"schedule"` | 9 |
| [WT_AM_LATER_TIME](WT_AM_LATER_TIME.json) | 资管回复 LATER_TIME | 通过 | `"schedule"` | 8 |
| [WT_AM_LATER_UNKNOWN](WT_AM_LATER_UNKNOWN.json) | 资管回复 LATER_UNKNOWN | 通过 | `null` | 9 |
| [WT_AM_REMIND1](WT_AM_REMIND1.json) | 资管联系 REMIND1 | 通过 | `"schedule"` | 9 |
| [WT_AM_REMIND2](WT_AM_REMIND2.json) | 资管联系 REMIND2 | 通过 | `"schedule"` | 9 |
| [WT_AM_REMIND3](WT_AM_REMIND3.json) | 资管联系 REMIND3 | 通过 | `"end"` | 9 |
| [WT_AM_UNCLEAR](WT_AM_UNCLEAR.json) | 资管回复 UNCLEAR | 通过 | `null` | 8 |
| [WT_BACKDATE_FORMAT](WT_BACKDATE_FORMAT.json) | 还房日 FORMAT | 通过 | `"transfer_to_human"` | 7 |
| [WT_BACKDATE_MISSING](WT_BACKDATE_MISSING.json) | 还房日 MISSING | 通过 | `"transfer_to_human"` | 7 |
| [WT_CONTACT_ACCEPTED](WT_CONTACT_ACCEPTED.json) | 私聊仅受理，等待回执 | 通过 | `null` | 8 |
| [WT_CONTACT_FAILED](WT_CONTACT_FAILED.json) | 私聊写失败不重试 | 通过 | `"transfer_to_human"` | 8 |
| [WT_DRAFT_ACCEPTED](WT_DRAFT_ACCEPTED.json) | 已受理但无协议ID | 通过 | `null` | 8 |
| [WT_DRAFT_EMPTY](WT_DRAFT_EMPTY.json) | 起草非法响应 EMPTY | 通过 | `"transfer_to_human"` | 8 |
| [WT_DRAFT_ERROR_1004](WT_DRAFT_ERROR_1004.json) | 起草异常 1004 | 通过 | `"transfer_to_human"` | 8 |
| [WT_DRAFT_ERROR_1007](WT_DRAFT_ERROR_1007.json) | 起草异常 1007 | 通过 | `"end"` | 8 |
| [WT_DRAFT_ERROR_501](WT_DRAFT_ERROR_501.json) | 起草异常 501 | 通过 | `"transfer_to_human"` | 8 |
| [WT_DRAFT_NO_ID](WT_DRAFT_NO_ID.json) | 起草非法响应 NO_ID | 通过 | `"transfer_to_human"` | 8 |
| [WT_DRAFT_STATUS_1](WT_DRAFT_STATUS_1.json) | 起草状态 1 | 通过 | `null` | 8 |
| [WT_DRAFT_STATUS_2](WT_DRAFT_STATUS_2.json) | 起草状态 2 | 通过 | `null` | 8 |
| [WT_DRAFT_STATUS_3](WT_DRAFT_STATUS_3.json) | 起草状态 3 | 通过 | `"end"` | 8 |
| [WT_DRAFT_STATUS_4](WT_DRAFT_STATUS_4.json) | 起草状态 4 | 通过 | `"end"` | 8 |
| [WT_DRAFT_UNKNOWN_STATUS](WT_DRAFT_UNKNOWN_STATUS.json) | 起草非法响应 UNKNOWN_STATUS | 通过 | `"transfer_to_human"` | 8 |
| [WT_OWNER_DAMAGE](WT_OWNER_DAMAGE.json) | owner存在物损 | 通过 | `"end"` | 6 |
| [WT_OWNER_UNFINISHED](WT_OWNER_UNFINISHED.json) | owner交割未完成 | 通过 | `null` | 7 |
| [WT_READ_TIMEOUT](WT_READ_TIMEOUT.json) | 协议查询 READ_TIMEOUT | 通过 | `"transfer_to_human"` | 3 |
| [WT_RENEWAL](WT_RENEWAL.json) | 有效续约 | 通过 | `"end"` | 3 |
| [WT_SAVE_FAILED](WT_SAVE_FAILED.json) | 意图保存写失败不继续起草 | 通过 | `"transfer_to_human"` | 8 |
| [WT_TENANT](WT_TENANT.json) | 有效租约 | 通过 | `"end"` | 4 |
| [WT_TENANT_DAMAGE](WT_TENANT_DAMAGE.json) | tenant存在物损 | 通过 | `"end"` | 6 |
| [WT_TENANT_UNFINISHED](WT_TENANT_UNFINISHED.json) | tenant交割未完成 | 通过 | `null` | 14 |

总计 92，通过 92，失败 0，未完成 0。

共 95 轮，最终场景轨迹含 567 次工具调用，另外保留 7 次旧 Mock 尝试供追溯。三条多轮接续均通过，保留 turnHistory、Resume 和每轮实际调用；旧手写 runner 与历史轨迹未用于本次结论。Mock 接口的 12 项独立契约检查、TypeScript 检查和 Skill 格式检查通过。

## 实测问题

4 个追问用例中，工具已返回未来联系时间，本次 Agent 仍按 SOP 追问；这是实际执行失败，已保留原始调用，未修改 Skill 掩盖结果。SOP 未明确“时间未到”的分支；如果工程侧保证只在到期唤醒，需要写明入口前提，否则应明确未到期时只返回 schedule。一次自测不能将问题完全归因于 Skill。

executionId 回查用例：修正旧 Mock 将 orderId 伪装为 executionId 的错误后重测；授权查询按工单返回真实推进 ID=123，Agent 引用此响应值完成联系和时间查询，未改写 fields，也未以 orderId 替代。首轮旧 Mock 尝试保存在 attempts/，不计入最终场景结果。Skill 的示例目前只写 fields.executionId，可补充这个已实测的取值来源。

两份 SOP 仍说 end 会销毁会话，与主 Skill 将会话管理交工程侧的说明矛盾，本次未验证真实宿主行为。

本次由同一模型编写用例并执行，是一次本地自测，不是独立模型评测，也不是 KERA/真实 Dubbo 联调。未据此推断生产环境成功率。
