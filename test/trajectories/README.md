# Agent 执行轨迹存档索引与说明

本目录专职持久化保存 **Agent Runner 搭载 `owner-self-termination` Skill 运行时的真实推理与工具调用轨迹**。

---

## 一、轨迹存档架构说明

我们提供了 **三个层级** 的轨迹与执行记录，既支持机器自动化对比分析，又支持工程师与业务方逐行审查 Agent 的推理决策链：

```
test/
├── trajectories/                             # 核心执行轨迹存档目录
│   ├── README.md                             # 本索引说明文档
│   ├── raw_llm_first_recruit_trajectory.jsonl          # 真实大模型推理原生轨迹：首招到期全流程
│   ├── raw_llm_asset_manager_multiturn_trajectory.jsonl# 真实大模型推理原生轨迹：资管多轮追问与时间消歧
│   ├── 01_首招到期全流程成功_Agent执行轨迹.md          # 详报：首招到期闭环 (TC14)
│   ├── 02_资管多轮澄清与追问_Agent执行轨迹.md          # 详报：资管多轮澄清对齐 (TC25)
│   ├── 03_委托到期双交割无物损全流程_Agent执行轨迹.md  # 详报：委托到期闭环 (TC20)
│   ├── 04_委托到期交割物损阻断_Agent执行轨迹.md        # 详报：交割物损安全阻断 (TC19)
│   ├── 05_起草写接口异常转人工_Agent执行轨迹.md        # 详报：写接口0重试熔断转人工 (TC15)
│   ├── 06_资管3次追问耗尽关单_Agent执行轨迹.md        # 详报：资管追问上限关单 (TC23)
│   ├── 07_资管暂不同意与原因追问_Agent执行轨迹.md      # 详报：资管暂不同意处理 (TC24)
│   ├── 08_意向为续约业务互斥关单_Agent执行轨迹.md      # 详报：意向互斥安全退出 (TC04)
│   └── 09_前置参数缺失直接转人工_Agent执行轨迹.md      # 详报：前置参数校验防御 (TC01)
├── results/                                  # 25 个全量评测用例的结构化 JSON 轨迹与总报
│   ├── EVALUATION_REPORT.md                  # 全景评测总报告 (通过率 100%)
│   └── result_TC*.json                       # TC01 ~ TC25 独立执行详报 (含毫秒级耗时与全量 Payload)
└── dataset/                                  # 6 大模块 25 套标准测试集定义
```

---

## 二、大模型原生执行轨迹 (Raw LLM Transcripts)

以下两份 `.jsonl` 文件直接导出自真实 AI Agent 执行该 Skill 时的全流程会话日志（由 DeepMind / Claude / GPT 等大模型驱动）：

1. **[`raw_llm_first_recruit_trajectory.jsonl`](file:///Users/zhiyu/Desktop/AI/自助解约agent/test/trajectories/raw_llm_first_recruit_trajectory.jsonl)**:
   - **执行用例**: 首招到期协议起草闭环全流程。
   - **记录内容**: Agent 逐步读取 `skill/SKILL.md`，按阶段推导、发起 HTTP 工具请求、获取 Mock 响应并最终返回结构化 JSON 的全量 Token 级推理记录。
2. **[`raw_llm_asset_manager_multiturn_trajectory.jsonl`](file:///Users/zhiyu/Desktop/AI/自助解约agent/test/trajectories/raw_llm_asset_manager_multiturn_trajectory.jsonl)**:
   - **执行用例**: 资管多轮确认场景（重点对齐 `codex://threads/01a17d8f-7144-72e3-9b68-e29d90669510`）。
   - **记录内容**: 资管第一轮回复“先稍后联系吧”时 Agent 挂起并追问具体时间；第二轮资管回复“明天上午10点确认”时，Agent 结合多轮上下文进行时间消歧与绝对时间归一化，输出 `schedule` 命令。

---

## 三、人类可读的结构化 Markdown 轨迹报告

每篇报告均按照标准 Agent 决策周期（**Thought $\rightarrow$ Action $\rightarrow$ Observation $\rightarrow$ Deduction $\rightarrow$ Return**）进行规范编排：

| 序号 | 报告文件 | 对应测试用例 | 核心验证能力与场景 |
| :--- | :--- | :--- | :--- |
| **01** | [01_首招到期全流程成功_Agent执行轨迹.md](file:///Users/zhiyu/Desktop/AI/自助解约agent/test/trajectories/01_首招到期全流程成功_Agent执行轨迹.md) | `TC14_FR_FULL_SUCCESS` | 意向排查 $\rightarrow$ 协议防重 $\rightarrow$ 延长期排查 $\rightarrow$ 续约排查 $\rightarrow$ 租客排查 $\rightarrow$ 资管授权同意 $\rightarrow$ 起草协议 $\rightarrow$ 业主群通知与 t+2 挂起 |
| **02** | [02_资管多轮澄清与追问_Agent执行轨迹.md](file:///Users/zhiyu/Desktop/AI/自助解约agent/test/trajectories/02_资管多轮澄清与追问_Agent执行轨迹.md) | `TC25_AM_CONTACT_LATER_MULTITURN` | 资管“稍后联系”模糊语义识别 $\rightarrow$ 结合上下文识别补充时间 $\rightarrow$ 唤醒后起草协议 |
| **03** | [03_委托到期双交割无物损全流程_Agent执行轨迹.md](file:///Users/zhiyu/Desktop/AI/自助解约agent/test/trajectories/03_委托到期双交割无物损全流程_Agent执行轨迹.md) | `TC20_ENT_FULL_SUCCESS` | 租客交割核验 $\rightarrow$ 业主交割核验 $\rightarrow$ 物损判定 $\rightarrow$ 资管授权 $\rightarrow$ 起草成功 |
| **04** | [04_委托到期交割物损阻断_Agent执行轨迹.md](file:///Users/zhiyu/Desktop/AI/自助解约agent/test/trajectories/04_委托到期交割物损阻断_Agent执行轨迹.md) | `TC19_ENT_HAS_DAMAGE` | 识别房屋物损（家具严重破损） $\rightarrow$ 立即关单阻断自动起草 $\rightarrow$ 私聊租务跟进物损处理 |
| **05** | [05_起草写接口异常转人工_Agent执行轨迹.md](file:///Users/zhiyu/Desktop/AI/自助解约agent/test/trajectories/05_起草写接口异常转人工_Agent执行轨迹.md) | `TC15_FR_DRAFT_FAILED` | 写操作 0 次自动重试安全护栏 $\rightarrow$ 后端返回异常立即输出 `transfer_to_human` |
| **06** | [06_资管3次追问耗尽关单_Agent执行轨迹.md](file:///Users/zhiyu/Desktop/AI/自助解约agent/test/trajectories/06_资管3次追问耗尽关单_Agent执行轨迹.md) | `TC23_AM_REPLY_EXHAUSTED` | 达到 3 次追问上限 $\rightarrow$ 自动关单 `command: "end"`，严防消息风暴与无休止挂起 |
| **07** | [07_资管暂不同意与原因追问_Agent执行轨迹.md](file:///Users/zhiyu/Desktop/AI/自助解约agent/test/trajectories/07_资管暂不同意与原因追问_Agent执行轨迹.md) | `TC24_AM_DECLINE_AND_REASON` | 资管暂不同意 $\rightarrow$ 持久化意图 $\rightarrow$ 私聊追问具体原因 $\rightarrow$ 挂起不关单不转人工 |
| **08** | [08_意向为续约业务互斥关单_Agent执行轨迹.md](file:///Users/zhiyu/Desktop/AI/自助解约agent/test/trajectories/08_意向为续约业务互斥关单_Agent执行轨迹.md) | `TC04_INTENTION_RENEW` | 业主意向为续约 $\rightarrow$ 业务互斥退出 $\rightarrow$ `command: "end"` 关单且群内不发干扰消息 |
| **09** | [09_前置参数缺失直接转人工_Agent执行轨迹.md](file:///Users/zhiyu/Desktop/AI/自助解约agent/test/trajectories/09_前置参数缺失直接转人工_Agent执行轨迹.md) | `TC01_PARAM_MISSING_ORDER_ID` | 缺失 `orderId` $\rightarrow$ 0 工具调用熔断 $\rightarrow$ 直接输出 `command: "transfer_to_human"` |

---

## 四、如何重放与重新生成轨迹

评测套件完全自动化，本地启动 Mock 服务后即可一键重放：

```bash
# 启动 Mock 服务 (如果尚未启动)
pnpm run start

# 运行 Agent Runner 评测全量 25 个用例并更新轨迹结果
pnpm test
```
