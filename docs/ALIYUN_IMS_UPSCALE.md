# 阿里云 IMS SR5 4K 超分基线

## 选择

4K 使用独立云端服务，不用 FFmpeg 做 AI 超分。首个实现是阿里云智能媒体服务 IMS 的音画增强 SR5：

- 4K 系统模板：`MP4-4K-UHD-SR5`
- 模板 ID：`S00000004-401070`
- 目标：宽度自适应、高度 2160、H.264、MP4
- 提交接口：`SubmitMediaConvertJob`
- 查询接口：`GetMediaConvertJob`
- 输入与输出：`oss://` 地址

官方方案说明：<https://help.aliyun.com/zh/ims/use-cases/enhance-aigc-generated-videos-with-audio-visual-super-resolution>

## 已实现

- `UpscaleProvider` 领域端口，隔离具体云厂商。
- `AliyunImsUpscaleProvider`，负责提交、轮询、状态归一化和 OSS 输出定位。
- 官方 TypeScript SDK 客户端工厂，使用阿里云默认凭据链。
- SR5 4K 请求结构和成功响应单元测试。
- IMS 1080P 母版使用主视频轨与同步音频轨，输出固定 1920×1080、H.264 High、30 fps、CRF 18。
- 母版不同时传 `Bitrate` 与 `Crf`，也不把未定义的 `Width/Height=1` 写入素材片段；这些约束有回归测试。
- 启动时强制 IMS、OSS 地域一致且使用官方公网地域端点；跨地域时间线在提交付费任务前被拒绝。

## 云端资源状态（2026-08-16）

- 已创建北京地域专用 Bucket：`jarvan-video-agent-harness`。
- Bucket 为标准存储、同城冗余、私有访问、阻止公共访问、OSS 托管 AES-256 加密。
- 代码与本地忽略配置已指向该 Bucket；在 RAM/STS 运行身份完成前继续保持 `DELIVERY_MODE=simulation`，避免半配置状态误触发付费任务。

## 真实接入前置条件

1. 开通智能媒体服务 IMS。
2. 准备同地域 OSS Bucket 与输入、输出前缀（已完成）。
3. 给运行时 RAM 角色授予最小必要的 IMS 提交/查询和 OSS 读写权限，至少包含文档要求的 `ice:SubmitMediaConvertJob`。
4. 先生成并转存 1080P 合成母版，再调用 4K 超分；不对每个零散镜头逐个超分（代码已完成）。

```dotenv
UPSCALE_PROVIDER=aliyun-ims
ALIYUN_IMS_REGION=cn-beijing
ALIYUN_IMS_TEMPLATE_4K=S00000004-401070
```

本地可以通过忽略文件提供 `ALIBABA_CLOUD_ACCESS_KEY_ID` 与 `ALIBABA_CLOUD_ACCESS_KEY_SECRET`；生产环境应使用 RAM 角色或 STS，不能把 AccessKey 写入仓库。

最小权限起点见 [`ALIYUN_RAM_POLICY.json`](./ALIYUN_RAM_POLICY.json)。运行时还会用 `oss:GetBucketInfo`、`ice:ListMediaProducingJobs` 和 `ice:ListMediaConvertJobs` 做付费前预检；这些均为只读调用。

母版合成接口与参数依据：<https://help.aliyun.com/en/ims/developer-reference/api-ice-2020-11-09-submitmediaproducingjob>、<https://help.aliyun.com/en/ims/developer-reference/timeline-configuration-description>、<https://help.aliyun.com/en/ims/developer-reference/clip-composition-parameter-description>。

公开计费页当前列出的中国内地 4K 超分标准版价格为 0.014 元/帧；按 30 fps 换算约 0.42 元/输出秒。本地预算使用该换算值，实际 SR5 模板档位、订阅折扣、OSS 与流量费用以控制台账单为准：<https://help.aliyun.com/zh/ims/on-demand-media-processing-3>。
