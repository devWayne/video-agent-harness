# Video Agent Harness

面向生产级横屏视频的 Agent-directed 执行与生产账本。主栈为 TypeScript + Node.js；Codex GPT 通过仓库内 Skill 承担人物/品牌设计、故事、分镜、Provider 路由、看片评审与局部重做决策，Runtime 负责类型化执行能力、恢复、资产血缘、门禁、可编辑时间线和交付状态。服务是无头 API，不再内置 React 创作台；OpenChatCut 等外部编辑工作区通过适配器接入，Runtime 始终是事实源。

## 当前能力

- `PUT /v1/projects/:id/production-plan`：保存由 Codex/兼容 Agent Host 编写的 Story → Scene → Shot 结构化创作计划和连续性状态。
- `POST /v1/projects/:id/operations`：声明 `control-generation / final-render / assembly / delivery` 类型化执行操作。
- 项目默认 `generationMode: local-only`：Runtime 在代码层拒绝 LibTV 与 `online-video` 生成；只有用户对当前项目明确授权后，才可 PATCH 为 `paid-providers-approved`。
- `POST /v1/projects/:id/operations/:operationId/start|complete|fail|review`：保存 Provider 任务、产物、失败和 Codex/人工评审；执行成功不会自动等于质量通过。
- `POST /v1/video-jobs`：以一句 Brief 创建 5–60 秒视频任务，支持幂等键。
- `GET /v1/video-jobs/:id`：查询统一任务、分镜、候选和产物状态。
- `POST /v1/video-jobs/:id/cancel`：取消非终态任务。
- `POST /v1/video-jobs/:id/retry`：从最后一个持久检查点重试可恢复失败。
- `GET /v1/video-jobs/:id/download`：为私有 4K 成片签发短时下载地址。
- `GET /v1/voiceovers/capabilities`、`POST /v1/voiceovers`：发现并调用百炼 `qwen-audio-3.0-tts-plus` 商业广告旁白能力，完整参数写入 OpenAPI。
- `POST /v1/projects`、`GET /v1/projects/:id`：持久化项目、故事、角色/场景一致性包、资产版本、工作台绑定与关联任务。
- `/v1/projects/:id/editorial-timelines/*`：保存画面、品牌叠加、字幕、原声、旁白、音乐和音效多轨时间线，支持候选版本、局部替换、审片标记、画面锁版与声音锁版。
- `POST /v1/projects/:id/editorial-timelines/:timelineId/workspace-sync`：通过 Streamable HTTP MCP 把受控时间线送入 OpenChatCut 人工精修；媒体必须先进入其素材池并显式映射，避免编辑器成为隐式资产源。
- `design-character-reference-pack`：由 Codex 设计并通过宿主图像生成能力产出 canonical 正脸、侧脸、三分之二侧脸、全身和服装细节；批准后以结构化视角映射冻结为 Character Pack。
- `POST /v1/projects/:id/assets|character-packs|scene-packs|scenes|video-jobs`：从项目内容空间创建可追溯生产任务。
- `POST /v1/compositions/preview`：把模板、标题、品牌色、动效和单段或多段 timed AI 背景视频编译为安全的 HyperFrames 合成预览。
- 默认 16:9；Direct 镜头分辨率按 Provider Profile 选择（Seedance 2.5 为 720P，其他现有 Profile 为 1080P），交付画布为 3840×2160。
- 每镜头默认生成两个候选；候选会保存 Shot Recipe、步骤任务、中间资产和结构化评价。
- SQLite 逐步骤检查点、进程重启无重复提交恢复、原子写入生产清单。
- Mock Provider 可完整跑通；百炼 Wan Provider 已实现提交和轮询协议，`wan2.7-t2v` 已通过真实调用；火山方舟 Seedance Provider 已完成 2.5 多模态提交、轮询、取消和错误归一化契约。
- 4K 后处理已支持阿里云 IMS SR5，以及火山 VOD `AIGC + Standard + 4k`；两者都与 Seedance/Wan 视频生成解耦。
- Codex GPT + 仓库总创作 Skill 是新的主 Agent 路径。Pi/确定性 Director 只保留在旧 `/v1/video-jobs` 兼容入口，不再代表主架构。
- Shot Recipe 已支持 `direct` 和 `comfyui-libtv` 两条配方。控制视频不是必经层：新内容类型先在最终模型上比较 `direct-keyframes` 与 `control-video`；Bettr 实证最终选择 Seedance 2.5 Direct，H3 只用于前期动效和路线试验。ComfyUI→LibTV 是可选高控制路线，真实纵向闭环仍待验收。
- LibTV 被拆成三个明确适配角色：脚本/分镜创意工具、在线视频生成执行器和视频组装工具；不会把 CLI 本身误当完整 Agent Harness。
- 新 ProductionOperation 主流程要求显式 `control-draft / final-candidate / delivery` 评审；旧 VideoJob 的“首个成功候选”评价器仅作为兼容基线，不能进入新主流程门禁。
- OpenAPI 3.1、Bearer 鉴权、健康/就绪检查、Prometheus 指标与可配置人民币成本预算。
- OpenChatCut 是首个可替换的多轨工作区适配器，承担串片预览、局部替换、音轨和人工审片；它不承担 Agent 编导，也不能取代项目账本。
- HyperFrames 保留为代码原生图形与预览工具；Bettr 的真实画面锁定、端点恢复、交叉过渡、音频对齐和封装由本地确定性媒体工具完成。

当前 Mock 流程输出的是 4K 合成清单，不是假装已经生成 4K MP4。已实证的 Bettr 路径是“28 页 PDF/参考视频 → 27 个镜头意图 → H3 路线试验 → 9 个 Seedance 2.5 生成段 → 118.333 秒 720P 画面锁定 → 火山 VOD AIGC Standard 4K → Qwen Audio 29 条旁白 → 4K 最终封装”。FFmpeg/ffprobe 只做确定性媒体工程与 QC，不冒充 AI 超分。

新的核心职责分层如下：

```text
Codex GPT + repo-local Skills（创作、路由、评价、重试决定）
  → 人物造型与多角度 Character Pack（图像生成 + Codex 定版）
  → TypeScript Runtime（操作执行、恢复、资产、门禁、血缘、成本）
  → generationMode 门禁（默认 local-only）
  → 本地 ComfyUI/H3 + 确定性工具；明确解锁后才可选在线终稿 Provider
  → 本地候选或 Seedance/MiniMax/LibTV/Wan 终稿 → Codex 严格评审
  → Harness EditorialTimeline（多轨串片、版本、局部替换、审片标记）
  ↔ OpenChatCut（可替换的人工编辑工作区）
  → 画面锁版 → 一次性 4K → 旁白/音乐/音效 → 声音锁版 → QC / Archive
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

生产构建只包含 Fastify API 和 Runtime，不再打包本地 Web UI。API 默认监听：

```text
http://127.0.0.1:4100/
```

接口契约位于 `GET /openapi.json`；生产环境设置 `HARNESS_API_KEY` 后，所有 `/v1/*` 请求都需要 Bearer Key。

创建任务：

```bash
curl --request POST http://127.0.0.1:4100/v1/video-jobs \
  --header 'content-type: application/json' \
  --data '{
    "brief": "一辆复古跑车沿海岸公路驶向日落",
    "durationSeconds": 15,
    "idempotencyKey": "campaign-001"
  }'
```

生产项目以仓库 Skill、Runtime 账本和外部工作区回写的 Manifest 为准。OpenChatCut 可选配置如下；它单独部署，Harness 不复制或内嵌其 AGPL 前端：

```dotenv
EDITORIAL_WORKSPACE_PROVIDER=openchatcut
OPENCHATCUT_MCP_URL=http://127.0.0.1:5199/api/external-mcp/mcp
OPENCHATCUT_EDITOR_URL=http://127.0.0.1:5199
OPENCHATCUT_APPROVAL_MODE=manual
```

默认 `VIDEO_PROVIDER=mock`，不会产生云端费用。下面的百炼直连配置仅用于回退、对照实验和协议烟测，不进入当前产品主流程：

```dotenv
VIDEO_PROVIDER=bailian
BAILIAN_BASE_URL=https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1
BAILIAN_API_KEY=...
BAILIAN_WAN_MODEL=wan2.7-t2v

VOICEOVER_PROVIDER=bailian-qwen-audio
BAILIAN_TTS_MODEL=qwen-audio-3.0-tts-plus
BAILIAN_TTS_VOICE=longanlingxin
BAILIAN_TTS_FORMAT=wav
BAILIAN_TTS_SAMPLE_RATE=48000
BAILIAN_TTS_ENABLE_AIGC_TAG=true
```

执行一笔最小真实烟测（默认 2 秒、720P、16:9）：

```bash
npm run smoke:wan
```

同一个北京地域 Workspace 和百炼 API Key 也可调用 Qwen Audio 3.0 Plus。执行一笔最小商业旁白烟测（会产生少量费用）：

```bash
TTS_SMOKE_CONFIRM_PAID=YES npm run smoke:voiceover
```

上层应用应先调用 `GET /v1/voiceovers/capabilities` 读取运行时默认值，再调用 `POST /v1/voiceovers`。返回的百炼音频 URL 只保留 24 小时，必须及时导入项目私有存储。全部字段、枚举、范围和制作建议见 [`docs/BAILIAN_QWEN_AUDIO_VOICEOVER.md`](./docs/BAILIAN_QWEN_AUDIO_VOICEOVER.md)。

广告和企业介绍片背景纯音乐使用独立的火山 BigMusic v5.0 OpenAPI：

```dotenv
MUSIC_PROVIDER=volcengine-bigmusic
VOLCENGINE_MUSIC_BILLING_MODE=duration
VOLCENGINE_MUSIC_DEFAULT_DURATION_SECONDS=60
VOLCENGINE_MUSIC_ENABLE_INPUT_REWRITE=false
VOLCENGINE_MUSIC_AIGC_WATERMARK=false
```

BigMusic 使用 IAM AK/SK，可复用下方已经配置的 `VOLCENGINE_VOD_ACCESS_KEY_ID/SECRET_ACCESS_KEY`，但账号仍需单独开通 AI 音乐生成大模型。先做不计费的授权预检：

```bash
npm run smoke:music
```

上层应用依次调用 `GET /v1/music/capabilities`、`GET /v1/music/usage`、`POST /v1/music/tracks` 和 `GET /v1/music/tracks/{taskId}`。生成完成并转存后，用本地 FFmpeg 完成旁白闪避混音：

```bash
npm run audio:mix -- \
  --video ./artifacts/master-4k.mp4 \
  --voiceover ./artifacts/voiceover-master.wav \
  --music ./artifacts/background-music.wav \
  --output ./artifacts/final-with-voice-and-music.mp4
```

完整字段、分段时长、版权控制、错误码、真实生成和混音参数见 [`docs/VOLCENGINE_BIGMUSIC.md`](./docs/VOLCENGINE_BIGMUSIC.md)。

火山方舟 Seedance 2.5 作为另一条独立 Direct Provider，不会替换百炼配置：

```dotenv
GENERATION_PIPELINE=direct
VIDEO_PROVIDER=volcengine
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_API_KEY=...
ARK_SEEDANCE_MODEL=doubao-seedance-2-5-260628
DIRECT_GENERATION_RESOLUTION=720P
```

执行一笔最小真实烟测（默认 4 秒、480P、16:9、有声，会产生火山费用）：

```bash
npm run smoke:seedance
```

启用独立 4K 超分适配器时，使用阿里云标准凭据链，生产环境优先绑定最小权限 RAM 角色：

```dotenv
UPSCALE_PROVIDER=aliyun-ims
ALIYUN_IMS_REGION=cn-beijing
ALIYUN_IMS_TEMPLATE_4K=S00000004-401070
```

完整云交付还需设置 `DELIVERY_MODE=cloud` 和同地域 `ALIYUN_OSS_BUCKET`。运行时会把 Wan 临时产物先流式转存为私有 OSS 对象，再创建 1080P 母版和 4K 版本。

改用火山 VOD AIGC 标准版 4K 时，母版与最终私有交付仍沿用现有 OSS，只有增强阶段切到火山：

```dotenv
DELIVERY_MODE=cloud
UPSCALE_PROVIDER=volcengine-vod
VOLCENGINE_VOD_ACCESS_KEY_ID=...
VOLCENGINE_VOD_SECRET_ACCESS_KEY=...
VOLCENGINE_VOD_SPACE_NAME=...
VOLCENGINE_VOD_REGION=cn-north-1
VOLCENGINE_TOS_REGION=cn-beijing
VOLCENGINE_TOS_ENDPOINT=tos-cn-beijing.volces.com
```

这里必须使用火山 IAM/VOD 的 AK/SK；`ARK_API_KEY` 只能调用 Seedance，不能给 VOD OpenAPI 鉴权。运行时会在付费生成前只读检查 VOD 空间。增强完成后通过 `GetMediaInfos → StoreUri → TOS` 回存，不要求配置 VOD 播放域名。

直接把本地 720P/1080P、16:9 视频升级为 4K：

```bash
npm run vod:upscale-4k -- \
  --input /absolute/path/input.mp4 \
  --output /absolute/path/output-4k.mp4 \
  --confirm-paid YES
```

命令会保存可恢复状态；已有 `RunId` 时只继续轮询，不重复提交付费任务。单独验证 URL 拉取路径则设置一个可访问的 MP4 地址和显式付费确认：

```bash
VOD_4K_SMOKE_SOURCE_URL='https://example.com/input.mp4' \
VOD_4K_SMOKE_CONFIRM_PAID=YES \
npm run smoke:vod-4k
```

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

`GENERATION_PIPELINE=comfyui-libtv` 会把本地控制视频上传到 LibTV 并运行付费在线模型。它不是模拟模式，也不是当前默认生产路径；首次真实验证建议使用一个 5 秒镜头和一个候选，以限制公网流量和费用。完整 Workflow Token、恢复规则和流量说明见 [`docs/COMFYUI_LIBTV_PIPELINE.md`](./docs/COMFYUI_LIBTV_PIPELINE.md)。

## 质量门禁

```bash
npm run check
```

该命令依次运行严格类型检查、ESLint、Vitest 和生产构建。

## 文档

- [`VISION.md`](./VISION.md)：产品目标和验收标准。
- [`DECISIONS.md`](./DECISIONS.md)：已锁定的产品与架构决策。
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)：当前模块和后续演进边界。
- [`docs/SERVICE_CATALOG.md`](./docs/SERVICE_CATALOG.md)：所有内外部服务的实证状态、鉴权边界和下一步缺口。
- [`docs/PRODUCTION_ASSETS.md`](./docs/PRODUCTION_ASSETS.md)：Bettr 真实生产复盘、资产分层和可复用方法。
- [`docs/VIDEO_AGENT_HARNESS_ARCHITECTURE.svg`](./docs/VIDEO_AGENT_HARNESS_ARCHITECTURE.svg)：从创意与人物资产、分镜、路线 A/B、质量循环到 4K 与旁白交付的当前分层大图。
- [`docs/SKILLS_AND_SYSTEM_MAP.md`](./docs/SKILLS_AND_SYSTEM_MAP.md)：Skill、开发期 MCP、生产 Harness、ComfyUI、LibTV、质量循环与交付层的完整映射。
- [`docs/LOCAL_CONFIGURATION.md`](./docs/LOCAL_CONFIGURATION.md)：仓库内 Skill、Codex/Claude Code 项目级安装，以及密钥、账号、内网地址和端口的提交边界。
- [`docs/COMFYUI_LIBTV_PIPELINE.md`](./docs/COMFYUI_LIBTV_PIPELINE.md)：本地控制骨架进入 LibTV 在线 V2V 的配置、协议与验收方法。
- [`docs/VOLCENGINE_SEEDANCE.md`](./docs/VOLCENGINE_SEEDANCE.md)：Seedance 2.5 模型 Profile、异步 API、多模态映射、恢复和错误处理。
- [`docs/VOLCENGINE_VOD_AIGC_4K.md`](./docs/VOLCENGINE_VOD_AIGC_4K.md)：本地/云端 AIGC 标准版 4K 全流程、无播放域名下载、CLI、费用和排障。
- [`docs/VOLCENGINE_BIGMUSIC.md`](./docs/VOLCENGINE_BIGMUSIC.md)：BigMusic v5.0 广告背景纯音乐、完整 HTTP 参数、版权控制、任务查询、转存和旁白混音。
- [`docs/EDITORIAL_WORKSPACE.md`](./docs/EDITORIAL_WORKSPACE.md)：Harness 多轨时间线、OpenChatCut、ComfyUI 与 LibTV 的层级、数据所有权和集成边界。
- [`docs/THIRD_PARTY_SKILLS.md`](./docs/THIRD_PARTY_SKILLS.md)：仓库内 vendored Skill 的来源、版本和凭据排除边界。
- [`docs/ACCEPTANCE.md`](./docs/ACCEPTANCE.md)：逐项实测证据与尚待账号侧验收的边界。
- [`docs/BAILIAN_WAN.md`](./docs/BAILIAN_WAN.md)：Wan 2.7 实测与 Wan 3.0 接入状态。
- [`docs/BAILIAN_QWEN_AUDIO_VOICEOVER.md`](./docs/BAILIAN_QWEN_AUDIO_VOICEOVER.md)：Qwen Audio 3.0 Plus 商业旁白 API、完整参数、音色、错误和制作流程。
- [`docs/ALIYUN_IMS_UPSCALE.md`](./docs/ALIYUN_IMS_UPSCALE.md)：独立云端 4K 超分基线。
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)：鉴权、恢复、指标、成本与容器部署。
- [`docs/OSS_BASELINE_REVIEW.md`](./docs/OSS_BASELINE_REVIEW.md)：开源项目参考与采用策略。
