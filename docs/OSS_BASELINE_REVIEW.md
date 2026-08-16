# Open-source baseline review

调研日期：2026-08-16。

## 结论

本项目继续从零实现，不直接 fork 现有视频 Agent 仓库。现有项目各自有值得复用的设计，但没有一个同时满足以下约束：

- TypeScript + Node.js 主栈；
- Pi Agent Core 控制面；
- 阿里云百炼 Wan 3.0 官方直连；
- 默认自主生成、自动候选与质量评估；
- 16:9 横屏、4K 生产母版；
- 可恢复的服务端长任务、幂等、回调、重试和成本审计。

策略是：**自有领域模型和运行时，从优秀仓库借鉴边界清晰的模式；只有稳定的底层引擎作为依赖引入。**

## 候选项目

| 项目 | 栈 / 许可证 | 值得参考 | 不作为底座的原因 | 采用方式 |
|---|---|---|---|---|
| [OpenReels](https://github.com/tsensei/OpenReels) | TypeScript，MIT | Fastify API、BullMQ/Redis Worker、Provider registry、成本估算、Critic、自带测试、Remotion 合成 | 默认面向竖屏社交 Shorts；视频 Provider 不含百炼；Agent 运行时不是 Pi；持久化和 4K 母版不是核心目标 | 重点参考队列、Provider 接口、进度事件和 Critic 测试，不 fork |
| [Tsugite](https://github.com/Takamasa045/tsugite) | TypeScript，MIT | Vendor-neutral manifest、generation adapter、EDL、Remotion/HyperFrames backend contract、ffprobe QC、完整生产日志 | 定位是本地、人工 Gate 驱动的工作坊；与默认自主服务端模式相反 | 参考 manifest、EDL、适配器和 QC 契约，不采用人工 Gate 架构 |
| [Code2MP4](https://github.com/code2mp4/code2mp4) | TypeScript，Apache-2.0 | Director → Storyboard → Scene → Assembly、可编辑场景源、确定性渲染、逐场景重试 | 核心是 HTML/CSS/GSAP 动效，不是神经视频生成；其路线图仍把 4K 列为后续能力 | 参考 Scene Schema、prompt stack 和确定性渲染边界 |
| [ViMax](https://github.com/HKUDS/ViMax) | Python，MIT | Director/Screenwriter/Producer 多 Agent、长视频叙事、角色与镜头一致性、并行镜头生成 | Python 主栈；偏研究型本地应用；不是 Node.js 服务端生产 Harness | 只参考 Agent 角色拆分和一致性策略 |
| [OpenMontage](https://github.com/calesthio/OpenMontage) | Python，AGPL-3.0 | 丰富的生产管线、工具注册、Provider 评分、成本日志、成片自检 | Python；依赖 Coding Agent 操作本地文件；AGPL 对网络服务衍生代码有较强约束 | 概念参考，不复制其 AGPL 代码到核心仓库 |
| [video-use](https://github.com/browser-use/video-use) | Python，MIT | 音频切点、淡入淡出、字幕、调色、切点自检等后期制作规则 | 主要编辑既有素材，不负责从 Brief 到生成视频；依赖 Coding Agent 与本地脚本 | 将生产正确性规则重写为 TypeScript 测试和 FFmpeg 工具 |

## 建议直接依赖的基础设施

### Pi Agent Core

使用 [`@earendil-works/pi-agent-core`](https://github.com/earendil-works/pi) 作为 Agent loop、工具调用、事件流与 steering 控制面。通过自有 `AgentRuntime` 接口隔离 Pi，避免领域层绑定具体框架。

### HyperFrames + FFmpeg

优先评估 [HyperFrames](https://github.com/heygen-com/hyperframes) 作为确定性字幕、包装、图形动画和最终合成层。它是 TypeScript/HTML 路线，Apache-2.0，适合 Agent 生成可检查的场景源。FFmpeg/ffprobe 继续承担编码、混音、探测、超分前后处理和母版验证。

[Remotion](https://github.com/remotion-dev/remotion) 保留为可选 Renderer adapter。它更成熟，但采用特殊许可；如果商业主体超过其免费许可条件，需要另行确认公司许可证。

## 不复制、只借鉴的边界

- 自行定义 `ProjectManifest`、`ShotSpec`、`GenerationJob`、`Timeline`、`QCReport` 和事件协议。
- 自行实现 Wan 3.0 Provider、持久化状态机、自动重试与选片逻辑。
- 从 MIT/Apache 项目移植具体代码时保留许可证与归属；AGPL 项目只做概念参考。
- 所有外部依赖固定版本、记录许可证，并通过适配接口可替换。

## 建议的自有模块

```text
apps/api                 HTTP/SSE/WebSocket API
apps/worker              durable job + media worker
packages/agent-runtime   Pi adapter and director tools
packages/domain          project/shot/job/timeline contracts
packages/providers       Wan 3.0 and future video providers
packages/workflows       deterministic production state machine
packages/media           FFmpeg, ffprobe, upscale and mastering
packages/renderers       HyperFrames primary, Remotion optional
packages/evals           shot scoring, continuity and delivery QC
```

