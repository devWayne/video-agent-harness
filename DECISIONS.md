# Decisions

## D0 — 供应商适配层

- **决定：** 业务编排不直接依赖阿里云或火山的请求/响应结构，使用统一 Provider 接口。
- **原因：** 视频模型版本和 API 迭代快，隔离变化可避免上层业务与 Agent 反复改造。
- **可逆：** 是。

## D1 — 密钥与付费调用

- **决定：** 仓库不保存云端密钥，默认使用 Mock Provider；真实付费调用必须显式配置环境变量后开启。
- **原因：** 防止凭据泄露与意外产生费用。
- **可逆：** 是，但不建议放宽。

## D2 — Harness 定位

- **决定：** 本项目是 Video Agent 的服务端 Harness，负责执行、编排和供应商接入。
- **原因：** 上层需要统一调度多模型、追踪异步任务并管理生成产物。
- **可逆：** 是；客户端 SDK 可作为后续独立包增加。

## D3 — 模型 Profile

- **决定：** 业务层只依赖统一 `VideoProvider`；当前唯一真实 Profile 是 `wan2.7-t2v`。Wan 3.0、I2V/R2V 与 Seedance 2.5 必须各自补充请求映射、能力约束和契约测试后才能启用。
- **原因：** 不同模型即使共享 endpoint，请求字段和能力也不等价；仅替换 Model ID 会制造无法验证的兼容性假设。
- **可逆：** 是。

## D4 — MVP 可验收产物

- **决定：** 当前纵向切片输入一句 Brief 与可选参考素材，输出 5–60 秒、16:9、3840×2160 的云端 MP4；Wan 2.7 自动生成匹配音频，并保存逐镜头中间产物和任务检查点。
- **补充：** 字幕、独立配音/BGM、包装模板与镜头级重做作为后续产品切片，不写入当前验收结论。
- **原因：** 先用真实可验证的生成、持久化、母版和 4K 链路建立生产骨架，再增加创作层能力。
- **可逆：** 是。

## D5 — 横屏 4K 生产交付

- **决定：** 首版默认 16:9 横屏，最终交付目标为 UHD 4K（3840×2160）。
- **实现边界：** 将模型生成分辨率与最终母版分辨率分开建模；模型素材允许以 1080P 生成，再进入超分、修复、合成和编码流水线。
- **原因：** 云端生成模型的输出规格与专业交付规格不同，解耦后才能独立替换生成模型、超分算法和编码方案。
- **可逆：** 是。

## D6 — 主技术栈

- **决定：** Harness 必须使用 TypeScript 与 Node.js。
- **架构影响：** Pi Agent Core 直接运行在控制面；API、工作流和 Provider SDK 均优先使用 TypeScript。仅当媒体/超分能力没有合适的 Node.js 实现时，才通过独立 Worker/RPC 接入 Python。
- **原因：** 统一主栈和类型契约，减少跨语言编排复杂度。
- **可逆：** 否，属于项目级技术约束。

## D7 — MVP 云端 Provider

- **决定：** 首版仅使用用户自己的阿里云百炼官方账号；先用已开放的 Wan 2.7 跑通真实链路，Wan 3.0 后续以新 Profile 接入。
- **范围：** 实现百炼任务创建、状态查询、失败归一化、结果转存与重试；火山方舟只保留 Provider 扩展接口，不进入 MVP。
- **原因：** 先用单一官方通道验证完整生产链路，降低联调变量和付费风险。
- **可逆：** 是。

## D8 — 百炼运行时配置

- **决定：** 百炼地域、Workspace ID、Wan Model ID 和 API Key 均由用户在部署后台配置，不作为仓库初始化的前置条件。
- **安全边界：** 仓库只提供变量名和校验规则；真实 API Key 不进入源码、示例、日志或版本控制。
- **原因：** 支持不同环境和账号快速切换，并避免凭据泄漏。
- **可逆：** 是。

## D9 — 默认自动生成

- **决定：** Agent 完成脚本和分镜后可直接调用付费生成 API，不设置强制人工审批。
- **护栏：** 当前记录计划生成秒数、4K 秒数和可配置费率下的成本预估；单任务硬上限、实际账单回填与异常熔断属于下一运维切片。
- **原因：** 前期优先验证智能化闭环和成片质量，减少人工操作摩擦。
- **可逆：** 是，可为特定环境或高预算任务重新启用审批。

## D10 — 自研优先，开源参考

- **决定：** 不直接 fork 现有视频 Agent 项目；从零实现自有领域模型、Pi 运行时适配、经过验证的 Wan Provider 和持久化生产状态机。
- **参考：** OpenReels 的队列/Provider/Critic，Tsugite 的 manifest/EDL/QC，Code2MP4 的场景契约，ViMax 的 Agent 角色，video-use 的后期正确性规则。
- **底层依赖：** 优先评估 Pi Agent Core、HyperFrames 和云端媒体服务；Remotion 作为受许可证约束的可选 Renderer，FFmpeg 仅作为可替换的媒体工具。
- **原因：** 现有项目没有同时满足本项目的主栈、Provider、自主模式、4K 母版和生产服务要求；直接 fork 会带来比重写核心更高的架构迁移成本。
- **可逆：** 是，但未来引入代码前必须重新审计维护状态和许可证。

## D11 — 自动多候选选片

- **决定：** 每个镜头默认生成 2 个候选；当前采用首个成功候选作为可重复的基线选片策略。
- **升级条件：** 后续引入 VLM 评分后，质量置信度不足时最多补第 3 个，仍不无限抽卡；该升级尚未作为当前能力交付。
- **原因：** 前期以智能化闭环和成片质量为优先，生成成本不是主要约束。
- **可逆：** 是，候选数和阈值均可按环境配置。

## D12 — Wan 百炼接入基线

- **决定：** MVP 当前使用已验证的 `wan2.7-t2v`，地域使用华北 2（北京）；未验证 Profile 的模型会被 Provider 主动拒绝。
- **协议：** 使用业务空间专属异步 DashScope 接口；Base URL、Workspace ID 与 API Key 只从运行时环境读取。
- **已确认能力：** 当前 T2V Profile 接受文本和最多一个音频参考；支持 720P/1080P、2–15 秒、16:9 与模型自动音频。图片和视频参考必须由后续 I2V/R2V Profile 处理。
- **画质策略：** Wan 2.7 负责 1080P 镜头素材，Harness 再完成 OSS 持久化、1080P 合成和独立 IMS SR5 3840×2160 交付。
- **接入状态：** Wan 3.0 控制台当前显示“申请中”，真实提交返回 `AccessDenied`；同一地域、Workspace、Key 与接口切换到 `wan2.7-t2v` 后已成功生成，证明百炼鉴权和异步任务链路可用。

## D15 — 独立云端 4K 超分

- **决定：** 不使用 FFmpeg 进行 AI 超分。Wan 先生成 1080P 素材，合成后的 1080P 母版进入独立 `UpscaleProvider`，首个实现采用阿里云 IMS SR5 4K 系统模板。
- **接口边界：** IMS 输入与输出均为 OSS 地址；工作流只依赖 `UpscaleProvider`，后续可以替换成其他云端 4K 服务。
- **凭据：** IMS 使用阿里云标准凭据链，生产环境使用具备最小权限的 RAM 角色，不复用百炼 API Key。
- **当前状态：** Provider、官方 Node.js SDK、OSS 流式转存、1080P 母版和 4K 任务均已接入可恢复主工作流；真实 IMS 验收仍需要 RAM/STS 凭据与 Bucket 配置。

## D13 — 模块化单体优先

- **决定：** 首个纵向切片使用单一 TypeScript 服务，以明确端口隔离 Director、Provider、Evaluator、Composer、Repository 和 Dispatcher。
- **原因：** 当前瓶颈是验证创作闭环和模型协议，而不是独立扩缩容；先保持部署简单，同时保留替换边界。
- **演进：** 本地使用 Node SQLite 和进程内 Dispatcher；多实例生产部署前替换为 PostgreSQL 与持久化队列，API 和领域模型保持不变。

## D14 — Pi 维护分支

- **决定：** 使用当前维护的 `@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai`，固定版本并封装在 Director 适配层。
- **原因：** 原 `@mariozechner/*` npm 包已被维护者标记弃用并指向 Earendil Works 分支。
- **安全边界：** 视频生成 Key 与规划模型 Key 分离；Pi Director 只能调用显式注册的结构化工具。

## D16 — 私有生产素材与按需下载

- **决定：** Wan 临时产物必须流式转存到项目专用私有 OSS，任务和 Manifest 只保存稳定的 `oss://` 定位与不含签名的规范地址。
- **交付：** 调用方通过受 Harness Bearer 鉴权保护的下载接口获取 60–3600 秒有效的签名 URL。
- **原因：** 供应商签名地址会过期，公共读 Bucket 会扩大泄漏和盗刷风险，而把新签名持久化也会制造过期状态与日志泄漏。

## D17 — HyperFrames 融入 Harness Studio

- **决定：** HyperFrames 作为 Harness 的确定性动效与合成引擎接入，不建立第二套独立产品；Studio 内与 Wan 生成并列呈现。
- **职责：** Wan 生成基础镜头，结构化 `CompositionSpec` 描述标题、品牌、动效和媒体引用，HyperFrames Core 负责 lint，官方 Player 负责浏览器预览。正式编码由后续隔离 Render Worker 执行。
- **安全边界：** API 不接受用户提供的 HTML 或脚本，只允许受限字段和 HTTPS 媒体 URL；服务端转义文本、生成固定模板并通过官方 lint。预览文档使用随机 ID、`no-store` 和有界内存缓存。
- **原因：** 统一时间线和素材模型才能让生成镜头、信息动效、字幕及后续多渠道素材协同，同时避免把 HyperFrames Studio 整体嵌入后形成割裂的双工作台。
- **可逆：** 是；未来可替换 Player 或 Render Worker，`CompositionSpec` 与上层交互保持稳定。

## D18 — 参考视频只提炼表现语法，不复制主题与素材

- **决定：** 将参考视频的多场景推进、时间牌、数据卡、地图路径和节奏化转场抽象为安全模板能力；首个非金融主题预设为 24 秒《智慧城市的一天》。不复用参考片人物、金融叙事或画面素材。
- **分工：** HyperFrames 负责确定性信息图形与时间线，Wan 负责后续可替换的写实人物和环境底片；遮挡关系由未来的蒙版/跟踪层解决。
- **产品策略：** 先沉淀可配置的场景原语，再扩展自由时间线编辑器，避免每支片都生成不可维护的任意 HTML。

## D19 — 从单 Provider 路由升级为 Shot Recipe

- **决定：** Execution Router 不再为一个镜头只返回一个 Provider，而是返回一张可持久化 `ShotRecipe`；Provider 是配方步骤执行器，可以并列也可以串联。
- **首批 Profile：** `direct` 保留 Mock/百炼直连；`comfyui-libtv` 串联本地控制视频与 LibTV 在线 V2V。
- **原因：** 高控制视频并不是在 ComfyUI 和在线模型之间二选一，而是先用底层节点工作流确定骨架，再用线上模型提高最终观感。
- **可逆：** 是；领域模型允许增加 ComfyUI-only、LibTV-only 和更多 DAG 配方。

## D20 — ComfyUI 输出作为有角色的控制资产

- **决定：** ComfyUI control-pass 的输出登记为 `motion-reference` 等 `GenerationAsset`，而不是直接当作最终镜头或无语义临时文件。
- **血缘：** 保存 Workflow、Prompt ID、本地文件、来源执行器和下游输入关系；Manifest v3 保存 Recipe、步骤与评价。
- **原因：** Harness 必须知道资产约束的是动作、相机、姿态、深度还是首尾帧，才能评价失败原因并只重跑正确阶段。
- **可逆：** 否；这是实现局部回跳、一致性治理和审计的基础领域语义。

## D21 — LibTV 的三角色与官方 CLI 边界

- **决定：** LibTV 分为 `LibTvScriptAdapter`、`LibTvGenerationStepExecutor` 和 `LibTvAssemblyAdapter`，分别承担创意规划、在线模型生成和创意组装；三者只通过官方 `libtv` CLI 运行。
- **参数边界：** 在线生成只能使用实时模型 Schema 暴露的高层参数；ComfyUI LoRA、ControlNet、Sampler、VAE 等深层参数不能通过 LibTV CLI 冒充控制。
- **原因：** 同一产品在流程中出现多次不等于同一架构职责，拆开后才能独立替换、测试和审计。
- **可逆：** 是；未来官方稳定 API 可以在保持端口契约的情况下替换 CLI 传输实现。

## D22 — Agent Harness 与生成后生产管线分离

- **决定：** AI Harness 以规划、Shot Recipe、生成执行、评价和重试闭环为边界；LibTV Assembly、HyperFrames、IMS、编码、音轨 QC 和归档归入 Post-production/Delivery。
- **术语：** 不再使用“Agent Harness 收回剪辑决策”描述生成后流程。
- **原因：** 自动化后期可以被 Harness 调度，但并不因此成为 AI Agent 决策循环本身；清晰术语有助于产品定位与代码所有权。
- **可逆：** 否，属于架构职责定义。

## D23 — 结构化质量报告先于自动回跳

- **决定：** Candidate Evaluator 返回多维 `EvaluationReport` 和 `accept / revise-control / regenerate-final / human-review` 决策，不再只返回候选 ID。
- **当前状态：** 默认评价器仍是首个成功候选基线，只是按新契约写入 `accept`；真实 VLM 评分和参数补丁驱动的局部回跳尚未完成。
- **原因：** 先稳定评价数据契约和持久化格式，再替换评价模型，避免把尚未实现的视觉判断包装成现有能力。
- **可逆：** 是；评价器可以按场景和合规要求替换。

## D24 — Wan 2.7 百炼直连退出产品主流程

- **决定：** 当前产品主流程固定为“ComfyUI 控制骨架 → LibTV Profile 选择的在线 V2V 模型 → 质量门”。百炼 `wan2.7-t2v` 直连只保留为供应商回退、效果对照和协议烟测，不进入默认生产路由。
- **模型边界：** LibTV 当前已验证的在线模型仍可以是 Wan 2.7，但它属于 `LibTvGenerationStepExecutor` 的可替换 Profile 参数，不等同于百炼直连流程，也不是架构硬编码依赖。
- **安全默认：** 未配置 ComfyUI Workflow 或 LibTV 画布时仍以 `direct + mock` 启动，避免自动上传素材或产生费用；安全启动默认不代表产品主路径。
- **保留原因：** 已验证的百炼 Provider、异步恢复和成本防护具有回归测试与容灾价值，暂不删除代码和文档证据。
- **可逆：** 是；当 LibTV 不满足某类镜头、成本或 SLA 时，Execution Router 可以显式选择该回退 Profile。

## D25 — 项目级 Skill 与可替换 Agent Host

- **决定：** 项目自有 Skill 的唯一源文件保存在仓库 `skills/`，Codex 与 Claude Code 仅通过项目级安装副本加载；Harness Runtime 不依赖某个 Agent Host。
- **决定：** `.env.local`、账号、密钥、项目 UUID、内网地址、端口、本机 Workflow 路径、登录状态、SQLite 和媒体产物不得进入远程仓库。
- **原因：** Skill 需要像代码一样被版本化和评审，而执行身份与机器配置必须独立注入；这样可在不同 Agent Host 和环境之间迁移同一生产体系。
- **可逆：** 否；宿主可替换性是企业交付和长期维护的基础边界。

## D26 — Studio 是生产控制终端

- **决定：** 3321 Studio 呈现创作规划、H3、LibTV、质量门、后期和交付的阶段状态，提供原生画布跳转，并聚合所有产物与血缘。
- **决定：** Studio 不复制 ComfyUI 节点编辑器和 LibTV 无限画布；专业参数仍在对应工具中编辑，Harness 只保存批准后的 Profile、任务、结果和决策。
- **原因：** 企业价值来自跨工具编排、可追溯质量闭环和交付控制，而不是再造两个成熟的专业画布。
- **可逆：** 是；未来可以嵌入受控的画布视图，但职责边界保持不变。

## D27 — Studio 与 ComfyUI / LibTV 只合并入口和数据

- **日期：** 2026-08-18。
- **决定：** Harness Studio 是项目控制面与资产事实来源；ComfyUI Web UI 是底层生成工作台；LibTV 无限画布是空间化创意工作台。三者共享 Project/Shot/Asset 标识、状态、产物血缘与深链接，但不合并成一个编辑器。
- **决定：** ComfyUI 和 LibTV 在架构中都拆成“面向人或开发期 Agent 的 Workbench”与“面向 Harness Runtime 的 API/CLI Provider”两个身份。
- **决定：** 早期“杭州 / 智慧城市”内容只保留为 HyperFrames 回归模板，不再作为 3321 Studio 的默认 Brief、默认成片标题或产品身份。
- **实现状态：** 2026-08-18 已落地 `Project / Story Scene / Character Pack / Scene Pack / Asset Version`、项目级 ComfyUI/LibTV 绑定、关联 VideoJob API 与 Studio 管理界面；二进制直传、按 Shot 深链接和 Provider 自动回收版本仍属后续增强。
- **原因：** 企业价值来自跨工具的项目治理、统一资产、评价重试、成本审计和交付，而不是复制 ComfyUI 节点编辑器或 LibTV 无限画布。
- **可逆：** 专业画布未来可以嵌入只读预览或受控子视图，但职责和数据所有权边界不变。
