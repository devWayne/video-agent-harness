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
