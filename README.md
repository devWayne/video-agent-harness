# Video Agent Harness

面向生产级横屏短视频的多模态 Agent 执行与编排服务。主栈为 TypeScript + Node.js；Pi Agent Core 负责智能导演控制面，持久化工作流负责供应商任务、重试、状态和产物交付。

## 当前能力

- `POST /v1/video-jobs`：以一句 Brief 创建 15–60 秒视频任务，支持幂等键。
- `GET /v1/video-jobs/:id`：查询统一任务、分镜、候选和产物状态。
- `POST /v1/video-jobs/:id/cancel`：取消非终态任务。
- 默认 16:9、1080P 镜头生成、3840×2160 交付画布。
- 每镜头默认生成两个候选并自动选片。
- SQLite 持久化、进程重启任务恢复、原子写入生产清单。
- Mock Provider 可完整跑通；百炼 `wan3.0-video` Provider 已实现提交和轮询协议。
- Pi Director 已通过 `@earendil-works/pi-agent-core` 工具调用接入；没有规划模型凭据时使用确定性 Director。

当前 Mock 流程输出的是 4K 合成清单，不是假装已经生成 4K MP4。FFmpeg 合成、超分和真实媒体转存是下一阶段执行面。

## 快速启动

要求 Node.js 22 或更高版本。

```bash
cp .env.example .env.local
npm install
npm run dev
```

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

默认 `VIDEO_PROVIDER=mock`，不会产生云端费用。启用百炼真实生成：

```dotenv
VIDEO_PROVIDER=bailian
BAILIAN_BASE_URL=https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1
BAILIAN_API_KEY=...
BAILIAN_WAN_MODEL=wan3.0-video
```

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
- [`docs/BAILIAN_WAN3.md`](./docs/BAILIAN_WAN3.md)：Wan 3.0 接入基线。
- [`docs/OSS_BASELINE_REVIEW.md`](./docs/OSS_BASELINE_REVIEW.md)：开源项目参考与采用策略。
