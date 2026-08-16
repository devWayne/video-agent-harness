# Architecture

## 当前模块化单体

```mermaid
flowchart LR
  Client["Harness Studio / Agent"] --> API["Fastify REST API"]
  Client --> Player["HyperFrames Player"]
  API --> Composition["CompositionService"]
  Composition --> Core["HyperFrames Core + Lint"]
  Composition --> Preview["同源短期预览 HTML"]
  Preview --> Player
  Composition -. "下一阶段" .-> Render["隔离 Render Worker"]
  API --> Service["VideoJobService"]
  Service --> Queue["WorkflowDispatcher"]
  Queue --> Workflow["WorkflowEngine"]
  Workflow --> Director["Pi / Deterministic Director"]
  Workflow --> Provider["Wan 2.7 / Mock / future model profiles"]
  Workflow --> Evaluator["Candidate Evaluator"]
  Workflow --> Store["MediaAssetStore"]
  Store --> OSS["Owned OSS Assets"]
  Workflow --> Master["IMS MasteringProvider"]
  Master --> HD["1920×1080 Master"]
  Workflow --> Upscale["IMS SR5 UpscaleProvider"]
  HD --> Upscale
  Upscale --> UHD["3840×2160 Delivery"]
  Service --> Repository["VideoJobRepository"]
  Workflow --> Repository
  Repository --> SQLite["SQLite（本地）"]
  Repository -.-> Postgres["PostgreSQL（生产适配器）"]
```

## Wan × HyperFrames 合成闭环

```mermaid
flowchart LR
  Brief["Brief + 角色/风格参考"] --> Director["Director：分镜与节拍"]
  Director --> Guide["HyperFrames：无文字构图参考帧"]
  Guide --> Wan["Wan 2.7 R2V/I2V：人物与场景运动"]
  Wan --> Clips["OSS：逐镜头 AI 视频"]
  Clips --> HF["HyperFrames：timed video clips"]
  Director --> Overlays["文字、卡片、标记、转场 cues"]
  Overlays --> HF
  HF --> Master["确定性 1080P 母版"]
  Master --> UHD["IMS：4K 交付"]
```

推荐采用“构图参考 → AI 底片 → 确定性图形合成”的三明治链路：HyperFrames 可以先输出不带最终文字和 Logo 的首帧/尾帧或构图参考，Wan 负责生成会动的人物与环境，最终再把逐镜头 Wan 结果作为 HyperFrames 第 0 轨视频片段，叠加可复现的文字、卡片和转场。不要把带清晰文字的 HyperFrames 成片交给生成模型重绘，否则文字、数字、品牌资产和帧级节拍都可能失真。

`CompositionSpec.backgroundClips` 是 AI 底片与确定性合成之间的契约。每个 clip 包含 `videoUrl`、合成时间线上的 `startSeconds`、使用时长 `durationSeconds`，以及源视频的裁切起点 `mediaStartSeconds`。HyperFrames 通过 `data-start`、`data-duration` 和 `data-media-start` 将多段视频放入同一底层轨道；上层信息图仍由模板和 GSAP 时间线控制。

## 边界原则

- Agent 只负责需要推理和工具调用的决策，不承担长时间供应商任务的可靠性。
- `WorkflowEngine` 只依赖端口：Director、Provider、Evaluator、DeliveryPipeline、Repository。
- 百炼请求和响应只存在于 Provider 内部；上层使用统一任务和错误模型。
- 云端密钥只从运行时环境读取，日志对鉴权字段执行脱敏。
- 生成素材与 4K 母版分层；Wan 输出最高 1080P，4K 由独立的云端 `UpscaleProvider` 完成。
- FFmpeg 不是超分实现；以后如引入，仅承担确定性的探测、封装、混音或编码辅助。
- Wan 与 HyperFrames 不是两套产品：Wan 负责生成像素素材，HyperFrames 负责可复现的排版、动效和合成；二者由同一 Harness Studio 和 `CompositionSpec` 协调。
- Studio 不接收任意 HTML/JavaScript。用户只提交经过 Zod 校验的结构化参数，服务端生成固定模板并通过 HyperFrames 官方 lint 后才暴露随机预览 URL。
- 多场景模板仍是一份 `CompositionSpec`：场景负责叙事段落，轨道负责背景与信息图层，GSAP 时间线负责进入、停留、退出和场景衔接；它不是另一套剪辑系统。

## 已实现与下一阶段

| 层 | 当前实现 | 下一阶段 |
| --- | --- | --- |
| Director | 确定性分镜；Pi Agent Core 工具提交适配器；结构与时长契约测试 | 接入独立百炼文本模型 Key，增加脚本/角色 Bible/视觉连续性 |
| Workflow | 状态机、逐任务检查点、跨进程恢复、取消、显式重试 | 持久化队列、退避重试、供应商回调、镜头级重做 |
| Provider | Mock；Wan 2.7 T2V；2.7 已真实验证 | 增加 Wan 2.7 R2V/I2V Profile，以角色参考、首帧、尾帧和前序片段维持连续性；Wan 3.0 授权后再增加独立 Profile |
| Evaluator | 首个成功候选 | VLM 多维评分与低置信度补抽 |
| Delivery | OSS 转存、IMS 1080P 母版、IMS SR5 4K、原子清单 | 字幕、独立配音/BGM 与成片 QC |
| Composition | 安全标题卡；《智慧城市的一天》6 场景模板；多段 AI 视频 timed clips；CSS/SVG 信息图；HyperFrames Core lint；官方 Player | 从已选 Wan candidates 自动构建 CompositionSpec；数据驱动 overlay cues；字幕、遮挡蒙版/跟踪、隔离 Render Worker |
| Operations | Bearer 鉴权、OpenAPI、健康/就绪、Prometheus gauge、成本预算 | 分布式 tracing、实际账单回填与告警 |
| Storage | Node SQLite + OSS | PostgreSQL；BullMQ/Redis 或 Temporal 适配器 |

SQLite 仅用于单节点开发和首个纵向切片。接口已经隔离，进入多实例部署前切换 PostgreSQL 和持久化队列，不改变 API 与领域模型。
