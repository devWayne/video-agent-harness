# 验收记录

更新时间：2026-08-22

## 已验证

| 范围 | 证据 | 结果 |
| --- | --- | --- |
| 工程质量门禁 | `npm run check` | 2026-08-22 全仓严格类型检查、ESLint、26 个测试文件/82 项测试和生产构建全部通过；本地产物、临时目录与开发工具目录均由 Git/ESLint 边界显式隔离 |
| Shot Recipe 契约 | `direct` 与 `comfyui-libtv` 单元测试 | 控制资产从 ComfyUI 步骤传入 LibTV 步骤；步骤状态、Task ID、最终视频和结构化评价可持久化 |
| ComfyUI Workflow 编译 | Harness Token 测试 | Prompt、帧数、宽度与 Seed 能以正确 JSON 类型注入 API-format Workflow |
| 本地 H3 动效控制实证 | MiniMax H3 FL2VA / REF2VA，PDF/UI 关键帧和多参考输入 | 代表镜头已真实生成；证明端点、元素运动和多参考路径可用，同时证明控制视频不应未经终稿 A/B 就成为全片必经输入 |
| LibTV CLI 映射 | Fake Canvas Client 契约测试 | 控制视频通过 `upload` 成为资源节点，随后创建 `video2video`、16:9、1080P Wan 2.7 节点；测试不产生上传或模型费用 |
| 项目级 Production Console | Project HTTP/API + SQLite 集成测试 | Project、参考资产、含 canonical 与多角度映射的 Character Pack、Scene Pack、Story Scene 与关联 VideoJob 完整持久化；跨项目 Asset/Pack 引用被拒绝 |
| HyperFrames 动效切片 | Studio → Composition API → Core lint → 官方 Player | 1920×1080 标题卡与 24 秒《智慧城市的一天》6 场景模板均通过 0 warning lint；浏览器实测开场、交通、智造、城市安全场景播放和 seek 正常 |
| Wan 2.7 最小协议 | `wan2.7-t2v`，2 秒，720P，16:9 | 阿里云异步任务成功，任务 ID `50e3dbbb-80aa-49ad-ac21-6baf0aca23ef` |
| Wan 2.7 生产请求 | `wan2.7-t2v`，2 秒，1080P，16:9，模型自动音频 | 阿里云异步任务成功，任务 ID `17adbb94-389c-4df6-bf1b-84ec3799e866` |
| Seedance 2.5 长片终稿 | 28 页 PDF → 27 个镜头意图 → 9 个 15 秒云端段 | 9 个任务全部完成；通过共享权威端点、13.5 秒选用区间和 0.4 秒交叉过渡形成 1280×720、24 fps、118.333 秒无音频画面母版 |
| 云端输入合规衍生图 | 4 个含非叙事性写真人像的 PDF 页面 | 本地创建保持布局的抽象身份符号衍生图，原图保持不变；9 个 Seedance 正式段无隐私拒绝。该步骤记录为合规预处理，不描述为绕过审核 |
| 本地纵向闭环 | Fastify API → 工作流 → Mock → 清单 | 创建任务后完成 3840×2160 模拟交付，健康检查、指标和事件均正常 |
| OSS 基础设施 | 北京地域专用私有 Bucket（名称仅本地配置） | 私有、阻止公共访问、同城冗余、OSS 托管 AES-256 加密 |
| 请求契约 | Wan T2V、OSS 持久化、IMS 母版、IMS SR5 | 单元和集成测试覆盖提交、轮询、恢复、跨地域拦截、私有下载签名 |
| 火山 VOD AIGC 标准版 4K 契约 | URL 拉取/本地上传 → Vid → `StartExecution` → `GetExecution` → `GetMediaInfos` → TOS | 单元测试覆盖 `Config=aigc`、`EnhanceLevel=Standard`、`Target.Res=4k`、导入到增强 Task ID 恢复、3840×2160 选择、TOS 签名、回存私有 OSS 和恢复未发布；默认路径不依赖播放域名 |
| 火山 VOD AIGC 标准版 4K 真实任务 | 1280×720、15.041667 秒 Seedance 2.5 MP4 | 单次付费任务成功；输出 H.264 High、3840×2160、24 fps、15.041667 秒、39,588,562 bytes；通过 TOS 公网端点下载并由 `ffprobe`/SHA-256 校验，媒资恢复 `Unpublished` |
| 火山 VOD AIGC Standard 长片 4K | 118.333 秒 Seedance 画面母版 | 任务成功并下载；3840×2160、24 fps、H.264、118.333 秒、304,507,866 bytes；可恢复状态保存 RunId、Vid、FileId、StoreUri 和 SHA-256，但本地状态文件不进 Git |
| Qwen Audio 3.0 Plus 旁白 | 29 条导演 Cue，可恢复批量脚本 | 29 条全部完成；48 kHz PCM 16-bit 单声道母带 118.333 秒；正常计费 766 字符，废弃重试 32 字符，收据不保存 Key 或临时 URL |
| 火山 BigMusic v5.0 纯音乐 | `GenBGMForTime/GenBGM` → `QuerySong` → 本地转存 | 119.857 秒商业配乐已真实生成并保存为 44.1 kHz 双声道 PCM WAV；Provider 契约测试覆盖 v5.0 结构、30–120 秒、分段优先级、AK/SK 签名、版权拒绝、任务状态和下载指令 |
| 商业旁白 + 背景音乐混音 | 118.333 秒 4K 旁白母版 + 119.857 秒音乐 | 音乐 −24 dB、1.5/3 秒淡入淡出、旁白侧链 8:1 闪避、视频流无损复制；输出 3840×2160、24 fps、48 kHz 双声道 AAC，实测综合 −16.2 LUFS、真峰值 −3.8 dBFS |
| 最终 4K + 旁白封装 | 4K 画面流 + 48 kHz 旁白母带 | 最终 MP4 为 3840×2160、24 fps、H.264 + AAC 单声道、118.333 秒；视频流不因加入旁白重复生成 |
| 无头 API 与多轨时间线 | 删除内置 UI；EditorialTimeline 单元/适配器测试 | 默认 API 端口改为 4100；支持七类轨道、候选保留、局部/波纹替换、标记、画面/声音 revision 与锁版失效；OpenChatCut MCP adapter 以 staged edit session 同步 |
| 付费前保护 | 云身份与 OSS/IMS 只读权限预检 | 自动测试覆盖；本机运行任务 `9add4247-c021-4832-8572-23417918f841` 在 `queued` 阶段以 `ALIYUN_CLOUD_PREFLIGHT_FAILED` 结束，镜头数为 0，证明未提交 Wan 候选 |
| 签名脱敏 | Provider 临时 URL → OSS 后 | 已持久化候选与生产清单移除账号、查询签名和 fragment；自动测试覆盖 |
| GitHub 远端 | 私有 `devWayne/video-agent-harness` | `main` 已创建并推送；本次 HyperFrames 切片继续沿用同一仓库 |

真实烟测脚本只记录任务 ID、规格与结果主机，不输出 API Key 或完整签名 URL。

## 待账号侧验收

| 范围 | 当前条件 | 验收动作 |
| --- | --- | --- |
| OSS 真实转存 | 需要本地 RAM/STS 运行身份 | 把 Wan 临时产物流式写入私有 Bucket，并核对对象元数据 |
| IMS 1080P 母版 | 需要同一运行身份及 IMS 权限 | 提交时间线，轮询成功并验证私有母版对象 |
| IMS SR5 4K | 依赖真实 1080P 母版 | 用系统模板 `S00000004-401070` 输出 3840×2160 成片 |
| 火山 VOD AIGC 标准版 4K 生产回存 | 真实增强已通过；仍需完整阿里 OSS/IMS 云身份 | 运行 `npm run smoke:cloud`，验证 1080P 母版跨云导入、4K TOS 产物回存私有 OSS 和下载 API；不需要 VOD 播放域名 |
| 私有下载 | 依赖真实 4K 对象 | 由 API 签发短时 URL，确认匿名访问失败、签名访问成功 |
| H3 Profile 注册到新 Operation Executor | 局域网真实 H3 已运行，但当前主要由项目工具调用 | 将已验证 Workflow 版本、Hash、参考槽与服务端能力写入 Profile Registry，并由 Project Operation 自动执行/恢复 |
| LibTV V2V 纵向闭环 | 需要画布 UUID 和有效 CLI 登录 | 上传已接受的 H3 控制视频，以线上模型生成最终镜头并核对 Recipe/Manifest；完成前不能把 ComfyUI→LibTV 写成默认主流程 |
| 真实质量评价 | 需要选择 VLM 与阈值 | 替换首成功基线，验证 `revise-control` 和 `regenerate-final` 的局部回跳 |
| OpenChatCut 真实纵向联调 | MCP adapter 和假客户端契约已通过 | 把真实素材导入 Media Pool，提供 Harness Asset 映射，以 manual 模式检查 staged proposal 并批准，再确认同步版本回写 Runtime |

代码默认保持 `DELIVERY_MODE=simulation`，直到真实 RAM/STS 凭据齐备；这样不会把“配置了一半”误当成已验收的付费生产链路。

账号身份配置完成后，`npm run smoke:cloud` 会执行上述四项账号侧验收，并把不含密钥和签名 URL 的结果写入 `.data/cloud-smoke/cloud-acceptance.json`。
