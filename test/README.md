# 业主自助解约（owner-self-termination）Skill 测试与评测体系

本目录包含针对 `owner-self-termination` Skill 的全方位评测集、测试用例、执行引擎与评测结果。

作为 **Agent Runner**，本套体系严格从**模型使用者与流程调度器**视角出发，以实际业务运行字段注入、真实请求驱动 Mock Server、记录单步决策轨迹并多维判定最终产出的合规性。

---

## 一、目录结构与职责划分

```text
test/
├── README.md                      # 测试集与评测框架说明文档（本文件）
├── runner.ts                      # Agent Runner 评测调度与断言执行引擎
├── dataset/                       # 6 大模块、25 个核心评测用例集定义
│   ├── 01_param_validation.json   # 模块 1：前置必填参数校验用例集 (TC01-TC03)
│   ├── 02_intention_branching.json# 模块 2：业主续解意向分流用例集 (TC04-TC07)
│   ├── 03_type_routing.json       # 模块 3：业务场景类型分流用例集 (TC08)
│   ├── 04_first_recruit_sop.json  # 模块 4：首招到期子流程用例集 (TC09-TC15)
│   ├── 05_entrusted_sop.json      # 模块 5：委托到期子流程用例集 (TC16-TC20)
│   └── 06_asset_manager_multiturn.json # 模块 6：资管确认多轮交互用例集 (TC21-TC25)
├── trajectories/                  # Agent 执行轨迹存档（大模型原生日志 + 结构化决策链路）
│   ├── README.md                  # 轨迹索引与详细说明
│   ├── raw_llm_first_recruit_trajectory.jsonl
│   ├── raw_llm_asset_manager_multiturn_trajectory.jsonl
│   └── 01 ~ 09_*.md               # 9 篇核心场景的 Thought/Action/Observation/Deduction/Return 轨迹
└── results/                       # 评测结果与执行轨迹落盘
    ├── EVALUATION_REPORT.md       # 全景评测大报告（包含矩阵汇总与深度分析）
    ├── result_TC01_PARAM_MISSING_ORDER_ID.json
    ├── result_TC14_FR_FULL_SUCCESS.json
    └── ...                        # 25 个 Case 的详细调用轨迹 (Trajectory) JSON
```

---

## 二、评测用例覆盖度（全景 25 Cases）

| 模块 | 用例 ID | 覆盖业务逻辑 | 核心预期动作 |
| :--- | :--- | :--- | :--- |
| **1. 前置校验** | `TC01` ~ `TC03` | 缺失 `orderId` / `contractCode` / `terminationType` | 0 工具调用，直接输出 `command: transfer_to_human` |
| **2. 意向分流** | `TC04` | 业主意向为续约 (`RENEW`) | 业务互斥提前结束，输出 `command: end` |
| | `TC05` ~ `TC06` | 意向待确认 (`PENDING`) 或未知 (`UNKNOWN`) | 意向未明提前结束，输出 `command: end` |
| | `TC07` | 意向标记为资管自跟进 (`ASSET_MANAGER_FOLLOW`) | 资管接管直接关单，输出 `command: end` |
| **3. 类型分流** | `TC08` | 非本期支持类型（如“托管中途解约”） | 超出本期范围提前结束，输出 `command: end` |
| **4. 首招子流程** | `TC09` | 存在已签约解约协议 (`isSigned=true`) | 群内发送致谢与不合作原因回访，`command: end` 办结 |
| | `TC10` | 存在在途待签协议 (`isSigned=false`) | 防重提前关单，输出 `command: end` |
| | `TC11` | 存在首招延长期变更协议 (`hasValidExtension=true`)| 延长期阻断到期解约，输出 `command: end` 关单 |
| | `TC12` | 存在业主续约合同 (`hasValidRenewal=true`) | 定义为“业主续约”，输出 `command: end` 关单 |
| | `TC13` | 存在租客在租租赁合同 (`hasValidTenantContract=true`)| 定义为“租客在租”，输出 `command: end` 关单 |
| | `TC14` | 首招到期全流程顺利起草成功 | 资管同意起草，写接口生成协议，`command: schedule` (t+2) |
| | `TC15` | 起草协议写接口调用失败 (网络抖动/501) | 0 次重试转人工服务管家，`command: transfer_to_human` |
| **5. 委托子流程** | `TC16` | 存在已签约解约协议 (`isSigned=true`) | 群内发送致谢与不合作原因回访，`command: end` 办结 |
| | `TC17` | 租客退租交割未完成 (`isDeliveryFinished=false`) | 私聊催租客交割并提醒上传业主交割单，阻断后续 |
| | `TC18` | 租客交割已完，但业主交割单未完成 | 私聊租务催办完成业主交割单，阻断起草协议 |
| | `TC19` | 交割清单检查存在物品损坏 (`hasDamage=true`) | 记录有物损关单，输出 `command: end`，严禁起草 |
| | `TC20` | 委托到期全流程顺利起草成功 | 双交割无物损，资管同意起草，写接口生成协议 |
| **6. 资管交互** | `TC21` | 资管状态为未联系 (`NOT_CONTACTED`) | 发送初次私聊，读取下次联系时间 `schedule` 挂起 |
| | `TC22` | 资管未回复待追问 (`WAITING_REPLY`) | 私聊发送阶梯追问，读取下次追问时间 `schedule` 挂起 |
| | `TC23` | 3 次追问耗尽 (`nextContactAt=null`) | 定义为资管未回复结束工单，输出 `command: end` |
| | `TC24` | 资管暂不同意起草 (`DECLINE_DRAFT`) | 保存意图，私聊追问原因及是否稍后联系，`command: null` |
| | `TC25` | 稍后联系多轮澄清闭环 | 跨轮次上下文消歧补充时间，`schedule` 挂起至约定时刻 |

---

## 三、快速执行评测

在项目根目录下执行以下命令即可启动评测引擎：

```bash
# 运行 Agent Runner 评测引擎（执行全部 25 个 Case 并更新 EVALUATION_REPORT.md）
pnpm run test:runner

# 或标准命令
pnpm test
```

执行完成后，可查看详细评测产物：
- 全景评测大报告：[`test/results/EVALUATION_REPORT.md`](results/EVALUATION_REPORT.md)
- 单用例执行轨迹：[`test/results/result_*.json`](results/)
- 执行轨迹详报与大模型原生推理日志：[`test/trajectories/README.md`](trajectories/README.md)
