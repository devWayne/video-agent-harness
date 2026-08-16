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

2026-08-16 的最小实测使用 `wan2.7-t2v`、2 秒、720P、16:9、无音频。任务成功完成并返回阿里云 OSS 产物地址，证明专属 endpoint、Key、提交和轮询链路均可用。烟测不打印 API Key 或带签名的完整产物 URL。

项目专用 Key 当前已收紧为仅允许 `Wan2.7-T2V`。以后切回 Wan 3.0 时，需要先在控制台为该 Key 增加相应模型范围。

```bash
npm run smoke:wan
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
- 项目继续以 Wan 2.7 开发；Wan 3.0 授权生效后只需改 `BAILIAN_WAN_MODEL` 并重跑烟测。

## 生产画质策略

模型素材以 1080P、16:9 生成。Harness 先形成 1080P 母版并转存 OSS，再交给独立的云端 `UpscaleProvider` 输出 3840×2160；生成模型、合成和 4K 超分是三个独立阶段。
