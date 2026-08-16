# Video Agent Harness

面向生产级横屏短视频的多模态 Agent 执行与编排服务。主栈为 TypeScript + Node.js；Pi Agent Core 负责智能导演控制面，持久化工作流负责供应商任务、重试、状态和产物交付。

## 当前能力

- `POST /v1/video-jobs`：以一句 Brief 创建 5–60 秒视频任务，支持幂等键。
- `GET /v1/video-jobs/:id`：查询统一任务、分镜、候选和产物状态。
- `POST /v1/video-jobs/:id/cancel`：取消非终态任务。
- `POST /v1/video-jobs/:id/retry`：从最后一个持久检查点重试可恢复失败。
- `GET /v1/video-jobs/:id/download`：为私有 4K 成片签发短时下载地址。
- `POST /v1/compositions/preview`：把模板、标题、品牌色、动效和单段或多段 timed AI 背景视频编译为安全的 HyperFrames 合成预览。
- 默认 16:9、1080P 镜头生成、3840×2160 交付画布。
- 每镜头默认生成两个候选并自动选片。
- SQLite 逐步骤检查点、进程重启无重复提交恢复、原子写入生产清单。
- Mock Provider 可完整跑通；百炼 Wan Provider 已实现提交和轮询协议，`wan2.7-t2v` 已通过真实调用。
- 阿里云 IMS SR5 4K 超分 Provider 已实现；它与视频生成解耦，输入、输出均使用 OSS。
- Pi Director 已通过 `@earendil-works/pi-agent-core` 工具调用接入；没有规划模型凭据时使用确定性 Director。
- OpenAPI 3.1、Bearer 鉴权、健康/就绪检查、Prometheus 指标与可配置人民币成本预算。
- React + TypeScript 横屏创作工作台，已接入任务创建、轮询、分镜、时间线、取消、检查点重试和交付事件。
- 同一 Studio 内提供“Wan 生成 / 动效合成”双引擎入口；官方 `@hyperframes/player` 负责 16:9 沙箱预览与 seek，`@hyperframes/core` 在服务端执行官方 lint。

当前 Mock 流程输出的是 4K 合成清单，不是假装已经生成 4K MP4。真实流程采用“Wan 生成 1080P 素材 → 合成 1080P 母版 → OSS → IMS SR5 输出 4K”的独立云服务链路；FFmpeg 不用于 AI 超分。

## 快速启动

要求 Node.js 22 或更高版本。

```bash
cp .env.example .env.local
npm install
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

在 Studio 中切到“动效合成”可选择标题卡、24 秒《智慧城市的一天》多场景信息动效，或“AI 人物 · 数据动效”。人物模板会把当前 Wan 候选作为底层视频，并按人物操作、转身和镜头推进的节拍叠加翻转数据卡、飞行 Token 与收束标题。当前 HyperFrames 路径是确定性浏览器预览，不会调用 IMS 或产生云渲染费用。

默认 `VIDEO_PROVIDER=mock`，不会产生云端费用。启用百炼真实生成：

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

账号中已准备北京地域专用私有 Bucket `jarvan-video-agent-harness`；本地忽略配置在 RAM/STS 运行身份完成前仍保持模拟交付，防止半配置任务误产生费用。

启用 Pi Director 需要一个可调用文本模型的独立 OpenAI-compatible Key：

```dotenv
DIRECTOR_MODE=pi
DIRECTOR_BASE_URL=https://example.invalid/v1
DIRECTOR_API_KEY=...
DIRECTOR_MODEL=qwen3.7-plus
```

视频生成 Key 与 Director Key 分离，便于最小权限和独立计费治理。

## 质量门禁

```bash
npm run check
```

该命令依次运行严格类型检查、ESLint、Vitest 和生产构建。

## 文档

- [`VISION.md`](./VISION.md)：产品目标和验收标准。
- [`DECISIONS.md`](./DECISIONS.md)：已锁定的产品与架构决策。
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)：当前模块和后续演进边界。
- [`docs/ACCEPTANCE.md`](./docs/ACCEPTANCE.md)：逐项实测证据与尚待账号侧验收的边界。
- [`docs/BAILIAN_WAN.md`](./docs/BAILIAN_WAN.md)：Wan 2.7 实测与 Wan 3.0 接入状态。
- [`docs/ALIYUN_IMS_UPSCALE.md`](./docs/ALIYUN_IMS_UPSCALE.md)：独立云端 4K 超分基线。
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)：鉴权、恢复、指标、成本与容器部署。
- [`docs/OSS_BASELINE_REVIEW.md`](./docs/OSS_BASELINE_REVIEW.md)：开源项目参考与采用策略。
