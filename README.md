# Video Agent Harness

面向生产级横屏短视频的 Agent-directed 执行与生产账本。主栈为 TypeScript + Node.js；Codex GPT 通过仓库内 Skill 承担人物、故事、分镜、执行路由、看片评审与局部重做决策，Runtime 只负责类型化执行、恢复、资产血缘、门禁和交付状态，React Production Console 只做可视化与人工接管。

## 当前能力

- `PUT /v1/projects/:id/production-plan`：保存由 Codex/兼容 Agent Host 编写的 Story → Scene → Shot 结构化创作计划和连续性状态。
- `POST /v1/projects/:id/operations`：声明 `control-generation / final-render / assembly / delivery` 类型化执行操作。
- `POST /v1/projects/:id/operations/:operationId/start|complete|fail|review`：保存 Provider 任务、产物、失败和 Codex/人工评审；执行成功不会自动等于质量通过。
- `POST /v1/video-jobs`：以一句 Brief 创建 5–60 秒视频任务，支持幂等键。
- `GET /v1/video-jobs/:id`：查询统一任务、分镜、候选和产物状态。
- `POST /v1/video-jobs/:id/cancel`：取消非终态任务。
- `POST /v1/video-jobs/:id/retry`：从最后一个持久检查点重试可恢复失败。
- `GET /v1/video-jobs/:id/download`：为私有 4K 成片签发短时下载地址。
- `POST /v1/projects`、`GET /v1/projects/:id`：持久化项目、故事、角色/场景一致性包、资产版本、工作台绑定与关联任务。
- `POST /v1/projects/:id/assets|character-packs|scene-packs|scenes|video-jobs`：从项目内容空间创建可追溯生产任务。
- `POST /v1/compositions/preview`：把模板、标题、品牌色、动效和单段或多段 timed AI 背景视频编译为安全的 HyperFrames 合成预览。
- 默认 16:9、1080P 镜头生成、3840×2160 交付画布。
- 每镜头默认生成两个候选；候选会保存 Shot Recipe、步骤任务、中间资产和结构化评价。
- SQLite 逐步骤检查点、进程重启无重复提交恢复、原子写入生产清单。
- Mock Provider 可完整跑通；百炼 Wan Provider 已实现提交和轮询协议，`wan2.7-t2v` 已通过真实调用。
- 阿里云 IMS SR5 4K 超分 Provider 已实现；它与视频生成解耦，输入、输出均使用 OSS。
- Codex GPT + 仓库总创作 Skill 是新的主 Agent 路径。Pi/确定性 Director 只保留在旧 `/v1/video-jobs` 兼容入口，不再代表主架构。
- Shot Recipe 已支持 `direct` 和 `comfyui-libtv` 两条配方。当前产品主流程是后者：先在本地 ComfyUI 生成 `motion-reference`，再通过官方 LibTV CLI 上传并调用 Profile 选择的在线视频模型生成最终镜头；Wan 2.7 是首个已验证模型，不是主流程硬编码依赖。
- LibTV 被拆成三个明确适配角色：脚本/分镜创意工具、在线视频生成执行器和视频组装工具；不会把 CLI 本身误当完整 Agent Harness。
- 新 ProductionOperation 主流程要求显式 `control-draft / final-candidate / delivery` 评审；旧 VideoJob 的“首个成功候选”评价器仅作为兼容基线，不能进入新主流程门禁。
- OpenAPI 3.1、Bearer 鉴权、健康/就绪检查、Prometheus 指标与可配置人民币成本预算。
- React + TypeScript Production Console 投影 Codex Production Plan、Runtime 操作、评审门禁、产物血缘、后期包装和 4K 交付，并可跳转到本机 ComfyUI 与 LibTV 专业画布。
- Studio 已从单次 Job 面板升级为项目级 `Project → Story Scene → Character/Scene Pack → Asset Version → VideoJob` 控制面；项目可以保存 ComfyUI Profile 和 LibTV Canvas 绑定。
- Studio 是 Harness 的控制终端和产物聚合层，不复制 ComfyUI/LibTV 的节点编辑能力；官方 `@hyperframes/player` 继续负责内置 16:9 动效预览与 seek，`@hyperframes/core` 在服务端执行 lint。

当前 Mock 流程输出的是 4K 合成清单，不是假装已经生成 4K MP4。真实交付采用“合格 1080P 镜头 → 合成 1080P 母版 → OSS → IMS SR5 输出 4K”的独立云服务链路；FFmpeg 不用于 AI 超分。镜头可以来自 LibTV 当前 Profile，百炼 Wan 2.7 直连只作为可选回退与对照实验。

新的核心职责分层如下：

```text
Codex GPT + repo-local Skills（创作、路由、评价、重试决定）
  → TypeScript Runtime（操作执行、恢复、资产、门禁、血缘、成本）
  → ComfyUI/H3 控制草稿 → Codex 宽松评审
  → Seedance/MiniMax/LibTV 逐镜头终稿 → Codex 严格评审
  → HyperFrames 确定性组装
  → IMS / QC / Archive（交付）
```

## 快速启动

要求 Node.js 22 或更高版本。

```bash
cp .env.example .env.local
npm install
npm run skills:install -- --host=codex
# 或：npm run skills:install -- --host=claude
# 默认创建指向 skills/ 的项目内符号链接；不支持链接时可追加 --copy
npm run dev
```

生产构建会把 Web UI 与 Fastify API 打包到同一服务。打开：

```text
http://127.0.0.1:3321/
```

修改前端时可另开终端运行 `npm run dev:web`，Vite 会把 `/v1` 和 `/health` 代理到本地 API。

接口契约位于 `GET /openapi.json`；生产环境设置 `HARNESS_API_KEY` 后，所有 `/v1/*` 请求都需要 Bearer Key。

创建任务：

```bash
curl --request POST http://127.0.0.1:3321/v1/video-jobs \
  --header 'content-type: application/json' \
  --data '{
    "brief": "一辆复古跑车沿海岸公路驶向日落",
    "durationSeconds": 15,
    "idempotencyKey": "campaign-001"
  }'
```

在控制台的“后期”阶段可以把当前合格视频候选作为底片，编译人物节拍、文字和数据动效的 HyperFrames 预览。当前 HyperFrames 路径是确定性浏览器预览，不会调用 IMS 或产生云渲染费用。

默认 `VIDEO_PROVIDER=mock`，不会产生云端费用。下面的百炼直连配置仅用于回退、对照实验和协议烟测，不进入当前产品主流程：

```dotenv
VIDEO_PROVIDER=bailian
BAILIAN_BASE_URL=https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1
BAILIAN_API_KEY=...
BAILIAN_WAN_MODEL=wan2.7-t2v
```

执行一笔最小真实烟测（默认 2 秒、720P、16:9）：

```bash
npm run smoke:wan
```

启用独立 4K 超分适配器时，使用阿里云标准凭据链，生产环境优先绑定最小权限 RAM 角色：

```dotenv
UPSCALE_PROVIDER=aliyun-ims
ALIYUN_IMS_REGION=cn-beijing
ALIYUN_IMS_TEMPLATE_4K=S00000004-401070
```

完整云交付还需设置 `DELIVERY_MODE=cloud` 和同地域 `ALIYUN_OSS_BUCKET`。运行时会把 Wan 临时产物先流式转存为私有 OSS 对象，再创建 1080P 母版和 4K 版本。

账号凭据配置完成后，用一条命令验收真实纵向闭环：

```bash
npm run smoke:cloud
```

该命令会先做 OSS/IMS 只读权限预检，预检失败不会产生 Wan 生成费用。

真实 Bucket 名称只保存在本地忽略配置中；在 RAM/STS 运行身份完成前仍保持模拟交付，防止半配置任务误产生费用。

仅在回归旧 `/v1/video-jobs` 自动流程时，启用 Pi Director 才需要独立 OpenAI-compatible Key；新的 Codex 主 Agent 流程不需要在 Runtime 配置 Director 模型：

```dotenv
DIRECTOR_MODE=pi
DIRECTOR_BASE_URL=https://example.invalid/v1
DIRECTOR_API_KEY=...
DIRECTOR_MODEL=qwen3.7-plus
```

视频生成 Key 与 Director Key 分离，便于最小权限和独立计费治理。

## ComfyUI → LibTV 高控制配方

该配方不是在三个 Provider 中“选一个”，而是把它们串成镜头执行图：

```text
ComfyUI H3/LoRA/ControlNet 控制通道
  → 本地 motion-reference.mp4
  → libtv upload
  → LibTV Profile 选择的在线 video2video 模型
  → final-video
  → 质量门
```

启用前需要：

1. 在 ComfyUI 中导出已经能独立运行的 API-format Workflow JSON；
2. 在需要动态注入的输入处使用 Harness Token；
3. 在 LibTV 建立或选择一张画布并取得 UUID；
4. 保持 `libtv login` 会话有效。

```dotenv
GENERATION_PIPELINE=comfyui-libtv
COMFYUI_BASE_URL=http://comfyui-host.internal
COMFYUI_STUDIO_URL=http://comfyui-host.internal
COMFYUI_WORKFLOW_PATH=/absolute/path/to/h3-control-api.json
LIBTV_CLI_PATH=libtv
LIBTV_PROJECT_UUID=00000000-0000-0000-0000-000000000000
LIBTV_STUDIO_URL=https://your-libtv-canvas-url
# 当前已验证值；可在重新审计实时 Schema 后替换。
LIBTV_MODEL_NAME=Wan 2.7
LIBTV_MODE_TYPE=video2video
LIBTV_MAX_DURATION_SECONDS=10
SHOT_CANDIDATES=1
```

`GENERATION_PIPELINE=comfyui-libtv` 会把本地控制视频上传到 LibTV 并运行付费在线模型。它不是模拟模式；首次真实验证建议使用一个 5 秒镜头和一个候选，以限制公网流量和费用。完整 Workflow Token、恢复规则和流量说明见 [`docs/COMFYUI_LIBTV_PIPELINE.md`](./docs/COMFYUI_LIBTV_PIPELINE.md)。

## 质量门禁

```bash
npm run check
```

该命令依次运行严格类型检查、ESLint、Vitest 和生产构建。

## 文档

- [`VISION.md`](./VISION.md)：产品目标和验收标准。
- [`DECISIONS.md`](./DECISIONS.md)：已锁定的产品与架构决策。
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)：当前模块和后续演进边界。
- [`docs/VIDEO_AGENT_HARNESS_ARCHITECTURE.svg`](./docs/VIDEO_AGENT_HARNESS_ARCHITECTURE.svg)：从创意、分镜、H3 控制、LibTV 精修到质量与 4K 交付的分层大图。
- [`docs/SKILLS_AND_SYSTEM_MAP.md`](./docs/SKILLS_AND_SYSTEM_MAP.md)：Skill、开发期 MCP、生产 Harness、ComfyUI、LibTV、质量循环与交付层的完整映射。
- [`docs/LOCAL_CONFIGURATION.md`](./docs/LOCAL_CONFIGURATION.md)：仓库内 Skill、Codex/Claude Code 项目级安装，以及密钥、账号、内网地址和端口的提交边界。
- [`docs/COMFYUI_LIBTV_PIPELINE.md`](./docs/COMFYUI_LIBTV_PIPELINE.md)：本地控制骨架进入 LibTV 在线 V2V 的配置、协议与验收方法。
- [`docs/STUDIO_WORKBENCH_BOUNDARY.md`](./docs/STUDIO_WORKBENCH_BOUNDARY.md)：Harness Studio、ComfyUI 工作台与 LibTV 无限画布的层级、数据所有权和集成边界。
- [`docs/THIRD_PARTY_SKILLS.md`](./docs/THIRD_PARTY_SKILLS.md)：仓库内 vendored Skill 的来源、版本和凭据排除边界。
- [`docs/ACCEPTANCE.md`](./docs/ACCEPTANCE.md)：逐项实测证据与尚待账号侧验收的边界。
- [`docs/BAILIAN_WAN.md`](./docs/BAILIAN_WAN.md)：Wan 2.7 实测与 Wan 3.0 接入状态。
- [`docs/ALIYUN_IMS_UPSCALE.md`](./docs/ALIYUN_IMS_UPSCALE.md)：独立云端 4K 超分基线。
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)：鉴权、恢复、指标、成本与容器部署。
- [`docs/OSS_BASELINE_REVIEW.md`](./docs/OSS_BASELINE_REVIEW.md)：开源项目参考与采用策略。
