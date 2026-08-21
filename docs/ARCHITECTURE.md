# Agent-directed video production architecture

> 重构基线：2026-08-20

完整 SVG 视图见 [`VIDEO_AGENT_HARNESS_ARCHITECTURE.svg`](./VIDEO_AGENT_HARNESS_ARCHITECTURE.svg)。

## 1. 一句话定义

本系统不是一个常驻的“Pi Director Agent”，也不是 ComfyUI 或 LibTV 的另一层皮肤。新的主架构是：

> Codex GPT 作为主 Agent，通过仓库内 Skill 做创作、路由、看片与重试决策；TypeScript Runtime 只执行明确操作并保存事实；Production Console 只把这些事实可视化。

`Harness` 表示工程化约束与执行能力，不再表示另一个会自行创作的 Agent。它由仓库 Skill、Runtime 契约、门禁和数据账本共同构成。

## 2. 四层职责

| 层 | 本项目中的实现 | 做什么 | 明确不做什么 |
| --- | --- | --- | --- |
| 主 Agent | Codex GPT；未来可换 Claude Code 等兼容 Host | 理解需求、设计并生成多角度人物参考、故事/分镜设计、选择 Skill 和 Provider、看片、诊断、重试与接受 | 不把会话历史当唯一生产记录 |
| Skill 知识层 | `skills/`（唯一源）与 `.agents/skills/`、`.claude/skills/`（项目链接） | 固化创作流程、H3 参数方法、质量准则、LibTV CLI 用法和交付策略 | 不保存密钥、内网地址或项目私有数据 |
| Runtime 事实与执行层 | `src/` TypeScript/Node.js | 校验命令、调用 Provider、保存任务 ID、资产、血缘、评审、成本与 Manifest | 不发明故事、不选“第一个成功结果”、不静默接受候选 |
| 端侧投影层 | `web/` React Production Console | 展示计划、镜头、操作、素材、评审、失败和交付；跳转外部工作台；支持人工接管 | 不做第二个 Agent，不复制 ComfyUI/LibTV 编辑器 |

外部执行面包括当前 Host 的图像生成能力、局域网 ComfyUI/H3、LibTV CLI/Canvas、Seedance、MiniMax 在线视频模型、HyperFrames、OSS/IMS 等。它们都是可替换执行器，不拥有人物定版、跨镜头叙事和验收权。

## 3. 主生产链路

```text
创作 Brief 与参考素材
  ↓
Codex + create-production-video
  ├─ 人物设计 Brief
  ├─ design-character-reference-pack
  │    └─ 图像生成 → 正脸/侧脸/三分之二侧脸/全身/服装细节
  ├─ Codex 评审并冻结 Character Pack
  ├─ 人物与场景 Bible
  ├─ 故事结构与分镜
  ├─ 每镜头连续性状态
  └─ 每阶段验收标准
  ↓ 写入
StoryProductionPlan
  ↓ 逐镜头声明 ProductionOperation
代表镜头路线 A/B
  ├─ 原始关键帧 + Prompt 直接进入终稿模型
  └─ 可选 ComfyUI / MiniMax H3 控制草稿 → Codex 宽松评审
  ↓ 依据最终模型证据选路
Seedance / MiniMax / LibTV / Wan 在线模型逐镜头或分段终稿
  ↓
Codex 严格终稿评审与局部重做
  ↓
Accepted final shots
  ↓
确定性画面锁定：端点恢复、剪辑、字幕、转场与品牌包装
  ↓
一次性 4K → 分 Cue 旁白与混音 → QC / Manifest / Archive
```

关键约束：在线生成模型处理单个镜头或边界明确的场景段，不默认重绘已经剪好的多场景母版。否则人物、字幕、剪点和音画同步会再次变得不确定。

## 4. 两个核心持久化契约

### `StoryProductionPlan`

由主 Agent 编写并通过 `PUT /v1/projects/:id/production-plan` 持久化：

- Story → Scene → Shot 层级；
- 每镜头叙事目的、动作、机位、声音、Prompt、生成时长和选用区间；
- 人物、地点、服装、风格、光线、音床等场景连续锚点；
- 相邻镜头的姿态、位置、视线、运动方向、相机和环境状态。

Runtime 负责 Schema 和跨项目引用校验，不改写创作内容。

### `ProductionOperation`

由主 Agent 逐项声明并通过 `/v1/projects/:id/operations` 记录：

```text
kind: control-generation | final-render | assembly | delivery
executor: comfyui | libtv | online-video | hyperframes | delivery | manual
shotId / sceneId
profileId
inputAssetIds / outputAssetIds
dependsOnOperationIds
providerTaskId
execution status
review status + review report
```

执行状态与评审状态互相独立：

```text
queued → running → succeeded → pending review → accepted / rejected / human-review
                    └──────────→ not-required（仅明确无需创作评审的操作）
```

“API 调用成功”只代表得到了产物，不代表产物达标。下游依赖只接受 `succeeded + accepted` 或显式 `not-required` 的操作。

## 5. 阶段门禁

| 阶段 | 决策者 | Runtime 校验 | 典型失败回路 |
| --- | --- | --- | --- |
| 人物造型与多角度参考 | Codex + `design-character-reference-pack` | 生成资产登记、canonical/view 映射、版本与项目归属 | 只重做漂移的视角；批准后冻结 Character Pack |
| 故事与分镜 | Codex | Production Plan Schema、Character Pack/项目引用、时长与连续性 | 回到场景设计或具体 Shot Intent |
| 控制草稿生成 | Codex 选路；ComfyUI 执行 | Profile、输入资产、依赖、任务检查点 | 仅重跑该镜头的 H3/ComfyUI 操作 |
| 控制草稿评审 | Codex | 必须记录 `control-draft` 评审 | 动作/机位/节奏问题回控制层；脸部细节可宽松 |
| 在线终稿生成 | Codex 选 Seedance/MiniMax/LibTV；Provider 执行 | 已接受依赖、输入资产、任务和输出 | 精修问题仅重跑终稿；骨架问题回控制层 |
| 在线终稿评审 | Codex | 必须记录 `final-candidate` 评审 | 身份、叙事、时序、画质严格卡控 |
| 画面锁定 | HyperFrames、本地确定性媒体工具或批准的 LibTV assembly | 每个计划镜头必须有已接受终稿；保存原始与修复后资产 | 只改端点、裁切、字幕、转场和包装 |
| 交付 | Delivery / VOD / IMS / Qwen Audio | 已接受画面母版、一次性 4K、Cue 时间轴、编码/QC/归档 | 只重跑失败的增强、Cue 或媒体步骤，不重新生成镜头 |

## 6. ComfyUI、H3 与 motion-reference

ComfyUI 是底层执行工作台，MiniMax H3 是其中可运行的模型能力。`motion-reference` 不是另一种模型，而是控制草稿资产的语义角色：它告诉下游终稿模型尽量保留动作、走位、镜头轨迹、构图和节奏。

控制草稿允许人物皮肤、服装材质和局部脸部细节存在非灾难性偏差，因为它的任务是验证骨架。最终候选不能用同样宽松标准。但“草稿合格”不等于“它适合成为终稿模型的输入”；必须在终稿模型上和直接关键帧路线做代表镜头 A/B，避免把草稿缺陷扩散到全片。

H3 动作参考和人物身份参考必须分槽：控制视频只传递动作、走位、运镜、构图和节奏；最终人物的脸、头型、发型、身体比例、服装与配饰以已批准 Character Pack 为准。终稿评审应同时对比 canonical 正脸和与候选头部角度最接近的参考视角。

ComfyUI 与 Runtime 的边界：

- 开发期 Agent/MCP 可探索节点、调参数、验证 Workflow；
- 生产 Runtime 只运行批准 Profile 和白名单参数；
- ComfyUI 输出必须登记成项目资产并关联操作、任务 ID 和 Profile；
- 本地 8188 地址、模型路径和凭据只放 `.env.local` 或本地配置，不进入 Git。

## 7. LibTV 的位置

LibTV 仍可承担多个角色，但都受 Codex 路由控制：

- 可选的脚本/分镜创意工具；
- 以上游控制视频为参考的在线最终镜头 Provider；
- 人工参与的画布探索；
- 可选的创意组装执行器。

它不是固定必经层。某个镜头可以走 `ComfyUI → Seedance`、`ComfyUI → MiniMax cloud`、`ComfyUI → LibTV model`，也可以在不需要骨架时直接进入在线终稿。LibTV 的 Canvas 不是系统事实来源；被接受的节点和产物必须回收到 Runtime。

## 8. Production Console 的定位

3321 上的端侧 UI 是兼容 Production Console，不再是主创作入口。API/Runtime 可独立使用；Nomi、Codex、ComfyUI 或 LibTV 可以作为操作界面，但产生的接受决定和资产事实必须回写 Runtime 或生产清单。兼容 Console 能展示：

- Codex Production Plan；
- 每个镜头的控制、终稿、组装和交付操作；
- Provider 任务 ID、尝试次数、错误和依赖；
- 输入素材、控制资产、在线候选、已接受镜头、母版和交付资产；
- Codex/人工评审分数与决定；
- ComfyUI、LibTV、HyperFrames 和交付服务的跳转入口。

旧 `/v1/video-jobs` 自动流程保留为迁移和回归入口，在 UI 中放到 `Legacy Autopilot` 区，不再代表主架构。

## 9. 当前代码完成度

| 能力 | 状态 |
| --- | --- |
| 仓库总创作 Skill 和 Agent/Runtime/Studio 边界 | 已重写 |
| `design-character-reference-pack` 与多角度 Character Pack 契约 | 已实现第一版 |
| `StoryProductionPlan` 持久化与严格验证 | 已实现 |
| `ProductionOperation` 执行状态、依赖、资产与评审门禁 | 已实现 |
| Assembly 前“所有镜头终稿均接受”校验 | 已实现 |
| Delivery 前“母版已接受”校验 | 已实现 |
| Production Console 的 Agent 计划、操作账本和门禁投影 | 已实现第一版，但已降为兼容 UI；不继续作为主产品界面投入 |
| ComfyUI API、LibTV CLI、百炼 Wan、HyperFrames、IMS 旧适配器 | 已存在，可复用 |
| 新 Operation API 自动调度 ComfyUI/在线模型执行器 | 待把现有 Provider 适配器接入；当前可由 Codex/Skill 执行后回写操作 |
| Seedance 2.5 云端最终视频 Provider | 已接入方舟异步任务 API、轮询、取消、多模态输入和 480P/720P Profile |
| VOD AIGC 标准版 4K | 已接入 URL/本地上传、任务恢复、`GetMediaInfos → TOS` 无播放域名回收和真实 3840×2160 验收 |
| Qwen Audio 3.0 Plus 旁白 | 已接入非实时 HTTP Provider、OpenAPI、29 Cue 可恢复生成与 48 kHz 母带封装；尚未成为独立 ProductionOperation Executor |
| MiniMax 云端最终视频 Provider | 尚未接入，需要账号/API Schema 后实现 |
| 可独立部署的图像生成 Runtime Provider | 尚未接入；当前由 Codex 调用宿主图像生成能力并把批准资产登记回 Runtime |
| 真实视觉模型自动评分 | 尚未接入；当前新架构要求 Codex/人工显式评审，不再使用首成功自动接受 |
| Nomi 工作区与 Runtime 双向同步 | 尚未接入；`.nomi/` 当前是本地实验状态且不进入 Git |
| 多实例数据库、队列、回调、对象存储资产服务 | 生产化后续项 |

## 10. 兼容代码的处理

`PiDirector`、`WorkflowEngine`、`ShotRecipe` 和 `FirstSuccessfulCandidateEvaluator` 暂时不删除，以免破坏已有真实任务和 Provider 验收。它们只属于旧 `/v1/video-jobs` 兼容入口。新主流程只认：

```text
Codex / compatible Agent Host
  → repo-local Skills
  → Production Plan
  → Production Operations
  → explicit reviews
  → accepted assets
  → deterministic delivery
```

待新 Operation Executor 覆盖 ComfyUI、在线终稿、HyperFrames 和 Delivery 后，再删除旧自动编导路径。
