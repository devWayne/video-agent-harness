# 服务与执行能力账本

> 状态基线：2026-08-22。本文只记录代码和真实任务证据；不把规划中的能力写成已接入。

## 状态定义

- `生产实证`：已用于 Bettr 118.333 秒成片并产生可检查产物。
- `真实烟测`：真实账号调用成功，但未进入 Bettr 最终链路。
- `契约已实现`：Provider、测试或 CLI 适配已存在，尚未完成真实纵向闭环。
- `实验工具`：用于创意探索或预览，不是生产记录的唯一来源。
- `兼容/待退役`：仍在代码中，但不代表当前主架构。

## 当前服务矩阵

| 能力 | 服务 / 工具 | Harness 接入位置 | Bettr 使用 | 当前状态 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 主导演与流程决策 | Codex GPT + 仓库 `skills/` | Agent Host；通过文件、CLI、OpenAPI 和项目清单协作 | 是 | 生产实证 | 当前主 Agent；创意、路由、看片、重试和接受决策不在 Runtime 内自动完成 |
| 项目事实与门禁 | TypeScript Runtime + SQLite | `src/domain`、`src/application`、`/v1/projects/*` | 部分 | 契约已实现 | 可保存 Project、Plan、Asset、Operation 和 Review；新 Operation API 当前是账本与门禁，不会自动调度全部 Provider |
| PDF/截图拆镜 | 本地 PDF 渲染、脚本与人工/Codex分析 | 项目工具和生产清单 | 是 | 生产实证 | 28 页输入被拆成 27 个镜头意图，并重组为 9 个云端生成段 |
| 动效控制草稿 | 局域网 ComfyUI + MiniMax H3 FL2VA/REF2VA | H3 Skill、Workflow Profile、ComfyUI API | 是，作为探索和草稿 | 生产实证 | 可验证 A→B、元素运动和多参考能力；Bettr 最终没有把 H3 视频作为 Seedance 参考，因为该轮底板质量会限制终稿 |
| 生产级视频生成 | 火山方舟 Seedance 2.5 | `VolcengineSeedanceProvider`、Direct Profile、批处理工具 | 是 | 生产实证 | 9 个 15 秒 720P 段生成并拼为 118.333 秒画面母版；当前最成熟终稿路径 |
| 备用视频生成 | 阿里云百炼 Wan 2.7 T2V | `BailianWanProvider` | 否 | 真实烟测 | 720P/1080P 最小任务已通过；当前是回退和对照路线，不是 Bettr 主流程 |
| 在线画布与模型聚合 | LibTV CLI / Canvas | `LibTvCliClient`、`comfyui-libtv` 兼容 Recipe | 否 | 契约已实现 | CLI Skill、Schema 查询和假客户端契约已具备；真实 H3→LibTV V2V 纵向闭环仍未验收 |
| 确定性动效预览 | HyperFrames | Composition API、Core lint、Player | 否 | 实验工具 | 智慧城市/标题包装预览已通过；Bettr 最终剪辑未使用该路径，不能将其写成 Bettr 成片事实 |
| 确定性剪辑与媒体处理 | FFmpeg / ffprobe | 生产脚本和交付 CLI | 是 | 生产实证 | 用于裁切、端点恢复、交叉过渡、音频对齐、封装和技术探测；不用于冒充 AI 超分 |
| 4K 画质增强 | 火山 VOD AIGC Standard + VOD 托管 TOS | `VolcengineVodAigcUpscaleProvider`、`vod:upscale-4k` | 是 | 生产实证 | 118.333 秒 1280×720 母版已升级为 3840×2160、24 fps；只对画面锁定母版执行一次 |
| 备用 4K 交付 | 阿里云 IMS SR5 + OSS | IMS/OSS Provider 和 Cloud Delivery | 否 | 契约已实现 | 单元契约和付费前预检已完成；当前账号侧完整 OSS→IMS→OSS 纵向链路未验收 |
| 商业旁白 | 阿里云百炼 Qwen Audio 3.0 Plus | Voiceover Provider、OpenAPI、可恢复时间轴脚本 | 是 | 生产实证 | 29 条 Cue、48 kHz 单声道 WAV，最终与 4K 画面封装；临时 URL 必须立即本地化 |
| 背景音乐 | 火山引擎 BigMusic v5.0 纯音乐 | `VolcengineBigMusicProvider`、Music OpenAPI、预检/生成 CLI、FFmpeg 商业混音 | 是 | 生产实证 | 119.86 秒商业配乐已生成；以 −24 dB 基准和 8:1 旁白侧链闪避混入 118.333 秒 4K 成片，实测 −16.2 LUFS、真峰值 −3.8 dBFS |
| 多轨编辑工作区 | OpenChatCut | `EditorialWorkspaceAdapter`、Streamable HTTP MCP | Antom 本地成片已使用 | 生产实证 | 9 段画面、旁白和音乐已同步为 11 项时间线并回写 `applied`；支持浏览器连接工程和 server-direct 两条路径，Harness 仍是事实源 |
| 无头控制 API | Fastify Runtime | `src/http`，默认 4100 | 是 | 契约已实现 | 不再托管 React UI；对 Agent Host、CLI 和外部编辑工作区提供统一契约 |

## 本机当前启用组合

被忽略的 `.env.local` 当前选择：

```text
GENERATION_PIPELINE=direct
VIDEO_PROVIDER=volcengine
DIRECT_GENERATION_RESOLUTION=720P
VOICEOVER_PROVIDER=bailian-qwen-audio
MUSIC_PROVIDER=volcengine-bigmusic
UPSCALE_PROVIDER=volcengine-vod
DELIVERY_MODE=simulation
```

这意味着 API 内的 Direct 生成和旁白 Provider 已启用；火山 VOD 可通过独立可恢复 CLI 执行。`DELIVERY_MODE=simulation` 表示 Runtime 的 OSS 云交付编排没有开启，不影响已经通过 `vod:upscale-4k` 完成的本地文件增强任务。

## 凭据与流量边界

- Seedance 使用方舟 Bearer API Key；VOD/TOS 与 BigMusic 使用 IAM AK/SK；方舟 Key 与 IAM AK/SK 不可混用。
- BigMusic 是独立的 `imagination/cn-beijing` OpenAPI 服务；复用 VOD IAM AK/SK 不代表账号已经开通音乐产品授权。
- Qwen Audio 与 Wan 复用北京地域百炼 Workspace 和 API Key，但模型权限、计费和临时产物生命周期各自独立。
- ComfyUI 内网地址、LibTV Canvas ID、OpenChatCut MCP/Editor 地址与令牌、云账号、Bucket/Space、绝对路径和签名 URL只进入 `.env.local` 或本地生产目录。
- Git 只保存代码、Skill、非敏感契约、脱敏案例记录和文档；大体积视频、渲染帧、日志、缓存和私有生产清单由 `.gitignore` 排除。

## 下一批工程缺口

1. 将已验证的 Seedance、H3、VOD、Qwen Audio 执行结果统一登记为 Project Asset 和 Production Operation，而不是仅由项目脚本保存外部 JSON。
2. 将已经新增的 `voiceover-take`、`voiceover-master`、音乐、音效、字幕和编辑预览资产角色接入真实 Project 生产记录，并补充音频阶段门禁。
3. 把 Codex/人工评审结果持续回写 Runtime；当前没有可独立部署的 VLM 自动质量服务。
4. 为 OpenChatCut 增加正式 `AssetImportAdapter`，在不扩大任意本地文件读取权限的前提下替代当前显式预导入步骤。
5. 完成一次真实 H3→LibTV V2V 闭环后，再决定是否把它提升为默认受控路线。
