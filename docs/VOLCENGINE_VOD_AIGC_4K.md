# 火山 VOD AIGC 标准版 4K：完整接入与运行手册

更新时间：2026-08-22

## 1. 已落地能力

Video Agent Harness 已完成两条可实际运行的 AIGC 标准版 4K 路径：

1. **生产云交付**：阿里 OSS 1080P 母版经 URL 拉取进入火山 VOD，增强完成后从 VOD 管理的 TOS 取回，再写回私有 OSS。
2. **本地文件命令**：直接上传本地 720P/1080P MP4，提交 AIGC 标准版 4K，下载到指定本地路径并用 `ffprobe` 验证。

当前 Profile 固定为：

| 字段 | 值 |
| --- | --- |
| `Config` | `aigc` |
| `Target.Res` | `4k` |
| `EnhanceLevel` | `Standard` |
| `RepairStrength` | `0`（可配置为 1/2） |
| 目标尺寸 | `3840 × 2160` |
| 输入上限 | `1920 × 1080` |
| 输入比例 | 当前 Harness Profile 要求 16:9 |

标准版兼顾处理速度与画质，适合分发型视频；专业版偏影视制作，算法和价格是另一档。本工程没有把“标准版”描述成专业版，也没有用 FFmpeg 插值冒充 AI 超分。

## 2. 凭据边界

4K 服务使用火山 IAM 的 `AccessKeyID + SecretAccessKey`：

```dotenv
VOLCENGINE_VOD_ACCESS_KEY_ID=
VOLCENGINE_VOD_SECRET_ACCESS_KEY=
VOLCENGINE_VOD_SESSION_TOKEN=
```

它们与 Seedance 的 `ARK_API_KEY` 完全不同：

| 凭据 | 用途 |
| --- | --- |
| `ARK_API_KEY` | 火山方舟 Seedance 视频生成，Bearer 鉴权 |
| `VOLCENGINE_VOD_ACCESS_KEY_ID/SECRET_ACCESS_KEY` | VOD、媒体处理及 VOD 管理的 TOS 文件，HMAC/SDK 鉴权 |

不要把任何 Key 写入 Git、任务 JSON、日志、截图或前端配置。开发机只放 `.env.local`；生产环境使用 Secret Manager、IAM 子用户最小权限或 STS 临时凭据。Key 如果曾粘贴到聊天、工单或公共终端记录，应立即轮换。

## 3. 端到端流程

### 3.1 本地文件路径

```text
本地 MP4
  → ffprobe 付费前校验（文件、分辨率、16:9、时长）
  → GetMediaList 只读空间预检
  → 官方 Node.js VOD SDK UploadMedia（支持分片/Checkpoint）
  → 获得 Vid
  → StartExecution
       Config=aigc
       EnhanceLevel=Standard
       Target.Res=4k
  → 立即保存 RunId（防止进程重启后重复计费）
  → GetExecution 轮询
  → GetMediaInfos 按 Vid 定位 3840×2160 TranscodeInfo
  → 解析 StoreUri = bucket/object-key
  → TOS 公网端点 HeadObject + GetObjectToFile
  → ffprobe 验证 3840×2160、时长、编码、文件大小
  → SHA-256 + 状态收据
  → 媒资保持 Unpublished
```

### 3.2 Harness 云交付路径

```text
合格镜头
  → 阿里 IMS 合成 1080P 母版
  → 私有 OSS 短时签名 URL
  → VOD UploadMediaByUrl
  → QueryUploadTaskInfo 取得 Vid
  → StartExecution（AIGC Standard 4K）
  → GetExecution
  → GetMediaInfos 定位 FileId / StoreUri / 3840×2160
  → VOD 管理的 TOS 生成短时 GET URL
  → 流式写回私有 OSS final-4k.mp4
  → VOD 媒资恢复 Unpublished
  → Harness API 按需签发最终 OSS 下载 URL
```

增强只在最终成片上执行一次，不逐镜头重复收费。VOD 的任务状态、`RunId`、回存状态会进入现有 `upscaling` 检查点；服务重启后继续轮询已存在任务。

## 4. 为什么不需要 DNS 播放域名

`GetPlayInfo` 是播放分发接口。在 Vid 模式下，它需要空间存在有效播放域名；没有域名会返回：

```text
ResourceNotFound.NoAvailableDomain
```

这不表示 AIGC 4K 任务失败，也不表示 AK/SK 应改成域名。工程现在使用：

```text
GetMediaInfos → TranscodeInfo.StoreUri → TOS 公网端点
```

因此，**上传、增强、下载和回存都不需要配置播放 DNS 域名**。只有需要让终端用户通过 VOD CDN 播放时，才需要配置播放域名并使用 `GetPlayInfo`。Provider 仍保留旧播放路径作为未配置 TOS 输出签名器时的兼容回退。

另一个容易混淆的接口是 `GetFileInfos`。其 `NeedDownloadUrl=true` 当前只支持 `DownloadUrlNetworkType=vpc-inner`，生成的是 VPC 内网地址；本地 Mac 不在火山 VPC 中，不能用它作为本地下载方案。

## 5. API 请求契约

增强任务使用 `2025-01-01` 版 `StartExecution`：

```json
{
  "Input": {
    "Type": "Vid",
    "Vid": "v03..."
  },
  "Operation": {
    "Type": "Task",
    "Task": {
      "Type": "Enhance",
      "Enhance": {
        "Type": "Moe",
        "MoeEnhance": {
          "Config": "aigc",
          "Target": {
            "Res": "4k"
          },
          "VideoStrategy": {
            "RepairStrength": 0,
            "EnhanceLevel": "Standard"
          }
        }
      }
    }
  },
  "Control": {
    "ClientToken": "video-harness-4k-<stable-input-hash>"
  }
}
```

`ClientToken` 从输入 SHA-256 稳定派生。即使请求成功后进程在写状态文件前退出，重试仍使用同一幂等键，降低重复付费风险。

查询链路：

| API | Version | 作用 |
| --- | --- | --- |
| `GetMediaList` | `2020-08-01` | 提交付费任务前验证空间和权限 |
| `UploadMedia`（官方 SDK） | SDK 封装 | 从本地上传，返回 Vid |
| `UploadMediaByUrl` | `2020-08-01` | 从 OSS/公网地址导入生产母版 |
| `QueryUploadTaskInfo` | `2020-08-01` | 轮询 URL 导入任务 |
| `StartExecution` | `2025-01-01` | 提交 AIGC 4K |
| `GetExecution` | `2025-01-01` | 轮询增强任务 |
| `GetMediaInfos` | `2023-07-01` | 获取 `TranscodeInfos`、`FileId`、`StoreUri` 和视频元数据 |
| TOS `HeadObject/GetObjectToFile` | TOS SDK | 验证并下载成品 |
| `UpdateMediaPublishStatus` | `2020-08-01` | 保证临时媒资最终处于 Unpublished |

## 6. 配置

```dotenv
DELIVERY_MODE=cloud
UPSCALE_PROVIDER=volcengine-vod

VOLCENGINE_VOD_ACCESS_KEY_ID=
VOLCENGINE_VOD_SECRET_ACCESS_KEY=
VOLCENGINE_VOD_SESSION_TOKEN=
VOLCENGINE_VOD_SPACE_NAME=your-space
VOLCENGINE_VOD_REGION=cn-north-1
VOLCENGINE_VOD_ENDPOINT=vod.volcengineapi.com

# VOD 默认北京存储对应的 TOS 公网端点。
VOLCENGINE_TOS_REGION=cn-beijing
VOLCENGINE_TOS_ENDPOINT=tos-cn-beijing.volces.com

VOLCENGINE_VOD_REPAIR_STRENGTH=0
VOLCENGINE_VOD_SOURCE_URL_EXPIRES_SECONDS=7200
VOLCENGINE_VOD_OUTPUT_URL_EXPIRES_SECONDS=3600
VOLCENGINE_VOD_REQUEST_TIMEOUT_MS=15000
```

云交付还需要现有的阿里 OSS/IMS 配置，因为工程继续用 OSS 保存候选、1080P 母版和最终私有 4K 成片。`.volces.com` 必须保留在 `MEDIA_IMPORT_ALLOWED_HOST_SUFFIXES`，让 OSS 资产存储器可以拉取 VOD TOS 的短时签名地址。

如果账号的 VOD 空间不在默认北京存储配置，先在控制台确认实际 TOS Region/Endpoint，再覆盖 `VOLCENGINE_TOS_*`；不要凭 Bucket 名猜地域。

## 7. 一条命令把本地视频变成 4K

先安装 `ffprobe` 并填写 `.env.local`，然后运行：

```bash
npm run vod:upscale-4k -- \
  --input /absolute/path/input-720p.mp4 \
  --output /absolute/path/output-4k.mp4 \
  --confirm-paid YES
```

参数说明：

| 参数 | 是否必需 | 说明 |
| --- | --- | --- |
| `--input` | 是 | 本地 16:9 视频绝对或相对路径 |
| `--output` | 否 | 默认在输入文件名后追加 `-4k` |
| `--confirm-paid YES` | 是 | 显式确认会创建真实计费任务 |
| `--state` | 否 | 覆盖恢复状态文件路径 |
| `--overwrite` | 否 | 已有输出文件时明确允许覆盖 |

命令会创建：

```text
output-4k.mp4
output-4k.mp4.volcengine-vod-4k.json
```

状态文件权限为 `0600`，记录输入指纹、Vid、RunId、FileId、阶段和最终 SHA-256，不记录 AK/SK 或签名 URL。上传 SDK 的 Checkpoint 文件只在断点续传期间存在，成功后由 SDK 清理。

恢复规则：

- 有 `Vid`：不重新上传。
- 有 `RunId`：不重新提交增强，继续 `GetExecution`。
- 已有 `StoreUri`：直接继续下载和校验。
- 状态文件和输入 SHA-256 不匹配：拒绝运行，避免把旧任务误用于新文件。
- 输出已存在：默认拒绝覆盖；必须显式传 `--overwrite`。

## 8. 烟测与自动测试

已有公网 MP4 时可运行 URL 拉取烟测：

```bash
VOD_4K_SMOKE_SOURCE_URL='https://example.com/input.mp4' \
VOD_4K_SMOKE_CONFIRM_PAID=YES \
npm run smoke:vod-4k
```

离线契约测试不会访问云端或产生费用：

```bash
npm test -- \
  test/volcengine-vod-upscale-provider.test.ts \
  test/volcengine-tos-output-store.test.ts \
  test/config.test.ts
```

## 9. 2026-08-22 真实验收记录

测试输入：Seedance 2.5 生成的 720P MP4。

| 指标 | 输入 | AIGC 标准版 4K 输出 |
| --- | ---: | ---: |
| 分辨率 | 1280 × 720 | 3840 × 2160 |
| 时长 | 15.041667 秒 | 15.041667 秒 |
| 帧率 | 24 fps | 24 fps |
| 编码 | H.264 | H.264 High |
| 文件大小 | 9,614,632 bytes | 39,588,562 bytes |
| 视频码率 | — | 约 21.05 Mbps |

验证结果：

- VOD 本地上传成功并取得 Vid。
- 只提交一个付费 `StartExecution` 任务。
- `GetExecution` 返回 `Success`。
- `GetMediaInfos` 定位到唯一 3840×2160 MP4 转码产物。
- 未配置播放域名时，`GetPlayInfo` 确实返回 `NoAvailableDomain`；改走 TOS 公网端点后下载成功。
- 下载文件通过 `ffprobe` 和 SHA-256 校验。
- 临时媒资最终为 `Unpublished`，转码产物保留。

这次验证说明“无播放域名”不会阻断上传、AIGC 处理或通过 TOS 下载，但账号仍需具备目标 VOD 空间权限和对应 TOS 对象读取权限。

### Bettr 118.333 秒长片实证

同日又对已锁定的完整 Seedance 画面母版执行一次增强：

| 指标 | 输入母版 | 4K 输出 |
| --- | ---: | ---: |
| 分辨率 | 1280 × 720 | 3840 × 2160 |
| 时长 | 118.333333 秒 | 118.333333 秒 |
| 帧率 | 24 fps | 24 fps |
| 视频编码 | H.264 | H.264 |
| 文件大小 | 42,506,618 bytes | 304,507,866 bytes |

任务完成并保存可恢复的 Vid、RunId、FileId、StoreUri、输入/输出 SHA-256 和 `downloaded` 状态。状态文件包含本机路径和云媒资定位，只保存在本地并由 Git 忽略。之后加入旁白时复制该 4K 视频流，没有再次提交 VOD 任务或重新编码画面。

## 10. 费用与资源生命周期

- `StartExecution` 是真实计费动作；`--confirm-paid YES` 是防误触保护，不是价格锁定。
- AIGC 画质增强费用、VOD 存储、跨云下行流量分别计费，账单控制台是最终依据。
- 代码只提交最终母版一次，因此 4K 计费秒数约等于最终视频时长，而不是候选镜头总时长。
- `Unpublished` 只关闭发布状态，不会删除源文件或 4K 产物，也不会停止存储计费。
- 删除 VOD 媒资是不可逆操作，当前命令不会自动删除；应由明确的保留策略或人工确认执行。

## 11. 常见故障

| 错误/现象 | 原因 | 处理 |
| --- | --- | --- |
| `NoAvailableDomain` | 调用了 `GetPlayInfo`，空间没有播放域名 | 使用当前 `GetMediaInfos + TOS` 路径；只有播放分发才配置域名 |
| `invalid network type` | `GetFileInfos` 请求下载 URL 时未传或传错网络类型 | 该接口目前只支持 `vpc-inner`；本地下载使用 TOS 公网端点 |
| TOS `AccessDenied` | IAM 只有 VOD 处理权限，没有对象读取权限 | 为目标 VOD 管理 Bucket 增加最小 `GetObject/HeadObject` 权限或使用合适 STS |
| `INVALID_VOD_INPUT_URL` | 云 Provider 输入不是 HTTP(S) | 先签发 OSS 短时 URL；本地文件使用 `vod:upscale-4k` |
| 输入超过 1080P | 当前 AIGC 画质增强模板的片源上限 | 先生成/转码为 720P 或 1080P 母版 |
| 输出文件已存在 | 防覆盖保护 | 核对状态文件和目标后显式使用 `--overwrite` |
| 状态文件不匹配 | 输入或输出路径发生变化 | 不要删除后盲目重跑；先确认旧 RunId 是否已产生费用，再换新状态路径 |
| `ffprobe is required` | 本机没有媒体探针 | 安装 FFmpeg/ffprobe 后再提交；检查发生在付费动作之前 |

## 12. 官方资料

- [画质增强修复模板](https://www.volcengine.com/docs/4/117971?lang=zh)
- [StartExecution：提交媒体处理任务](https://www.volcengine.com/docs/4/2124632?lang=zh)
- [GetExecution：查询任务结果](https://www.volcengine.com/docs/4/1582325?lang=zh)
- [媒资上传与服务端 SDK](https://www.volcengine.com/docs/4/65640?lang=zh)
- [GetMediaInfos：获取源文件与转码产物](https://www.volcengine.com/docs/4/1256363?lang=zh)
- [查看与管理媒资信息](https://www.volcengine.com/docs/4/67347?lang=zh)
- [Vid 与 DirectUrl 模式](https://www.volcengine.com/docs/4/228633?lang=zh)
- [VPC 内网上传下载](https://www.volcengine.com/docs/4/1374081)
- [视频点播计费说明](https://www.volcengine.com/docs/4/76544)
- [火山 OpenAPI Node.js SDK](https://github.com/volcengine/volc-sdk-nodejs)
- [火山 TOS JavaScript SDK](https://github.com/volcengine/ve-tos-js-sdk)
