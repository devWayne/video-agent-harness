# 阿里云百炼 Wan 接入基线

> 控制台与真实调用核对日期：2026-08-16。厂商能力、价格和限流可能调整，上线前需重新校验。

## 当前运行配置

| 配置 | 值 |
| --- | --- |
| 地域 | 华北 2（北京） |
| 当前模型 | `wan2.7-t2v` |
| 待切换模型 | `wan3.0-video` |
| 任务接口 | `POST https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis` |
| 鉴权 | `Authorization: Bearer ${DASHSCOPE_API_KEY}` |
| 异步请求头 | `X-DashScope-Async: enable` |

2026-08-16 完成两档真实验证：先用 2 秒、720P、16:9 验证最小协议；随后修正音频参数后，再以 2 秒、1080P、16:9、模型自动生成音频验证生产请求。两次任务均成功完成并返回阿里云 OSS 产物地址，证明专属 endpoint、Key、提交和轮询链路均可用。烟测不打印 API Key 或带签名的完整产物 URL。

Wan 2.7 在没有 `input.audio_url` 时会自动生成匹配的背景音乐或音效，官方协议没有布尔型 `parameters.audio` 开关。Provider 因此不会发送未记录字段；一个音频参考会映射为 `input.audio_url`，图片和视频参考会要求切换到后续 I2V/R2V Provider。

官方参考：<https://help.aliyun.com/en/model-studio/text-to-video-api-reference>

## 角色连续性与构图控制

当前 `BailianWanProvider` 是已验证的 T2V Profile，因此尚不会把图片或视频参考误发到文生视频接口。下一条生产 Profile 使用 `wan2.7-r2v-2026-06-12`：`reference_image` / `reference_video` 固定人物、服装、声音与主体特征，`first_frame` 固定镜头构图；需要串接镜头时，I2V Profile 使用首尾帧或 `first_clip` 延续前一段视频。官方接口仍是生成式约束，不保证像素级复现，因此最终文字、数字和 Logo 必须留在 HyperFrames 合成层。

- Wan 2.7 参考生视频 API：<https://help.aliyun.com/zh/model-studio/wan-video-to-video-api-reference>
- Wan 2.7 图生视频 API：<https://help.aliyun.com/zh/model-studio/image-to-video-general-api-reference>
- 图生视频使用指南：<https://help.aliyun.com/zh/model-studio/wan-image-to-video-guide>

项目专用 Key 当前已收紧为仅允许 `Wan2.7-T2V`。以后切回 Wan 3.0 时，需要先在控制台为该 Key 增加相应模型范围。

```bash
npm run smoke:wan
```

生产规格验证：

```bash
WAN_SMOKE_RESOLUTION=1080P WAN_SMOKE_DURATION_SECONDS=2 npm run smoke:wan
```

运行时模型由环境变量切换，无需改代码：

```dotenv
BAILIAN_REGION=cn-beijing
BAILIAN_WORKSPACE_ID=
BAILIAN_BASE_URL=https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1
BAILIAN_API_KEY=
BAILIAN_WAN_MODEL=wan2.7-t2v
```

## Wan 3.0 状态

- 控制台存在 `wan3.0-video`、API 示例、价格和 30 秒能力说明，但账号页面仍显示“申请中”。
- 使用正确地域、Workspace 专属 endpoint 和完整项目 Key，且把 Key 权限从模型限定临时放宽为全部后，两次提交均返回 `AccessDenied`。
- 随后用同一套 endpoint 与 Key 调用 Wan 2.7 成功，因此当前阻塞点是 Wan 3.0 模型权限尚未生效，而不是代码协议或 Key 无效。
- 项目继续以 Wan 2.7 开发；Wan 3.0 授权生效后仍需先实现并测试独立请求 Profile，当前 Provider 会拒绝仅修改 `BAILIAN_WAN_MODEL` 的未验证切换。

## 生产画质策略

模型素材以 1080P、16:9 生成。Harness 先形成 1080P 母版并转存 OSS，再交给独立的云端 `UpscaleProvider` 输出 3840×2160；生成模型、合成和 4K 超分是三个独立阶段。

2026-08-16 官方北京原价为 720P 0.6 元/秒、1080P 1 元/秒。本地忽略配置使用 1 元/秒进行 1080P 预算，部署时仍以控制台最新价格为准。
