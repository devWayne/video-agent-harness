# 火山引擎 BigMusic v5.0 广告背景音乐接入

更新时间：2026-08-22

## 已落地范围

Harness 已接入火山引擎 AI 音乐生成大模型的纯音乐接口，面向商业广告、企业介绍片和产品发布片的无人声背景音乐：

- `GenBGMForTime`：按生成音乐时长后付费；
- `GenBGM`：预付套餐包按首计费；
- `QuerySong`：查询异步任务、进度、失败原因和音频地址；
- `QueryUsage`：在生成前只读检查授权状态和额度；
- BigMusic `v5.0`：30–120 秒，支持 `intro/verse/chorus/inst/bridge/outro` 分段结构；
- HTTP capabilities：上层应用可以读取所有非敏感参数、默认值和限制；
- 下载地址解析：完成后取得提供方 URL，并明确要求立即转存；
- FFmpeg 广告混音：背景音乐循环、淡入淡出、旁白侧链闪避和最终响度控制。

这不是火山方舟 API。Seedance 使用 `ARK_API_KEY` Bearer 鉴权；BigMusic 使用 IAM `AK/SK` 对 `imagination/cn-beijing` OpenAPI 做 HMAC-SHA256 签名。两套凭据不能混用。

## 官方接口基线

| 能力 | Action | Method | Version |
| --- | --- | --- | --- |
| 按时长生成纯音乐 | `GenBGMForTime` | POST | `2024-08-12` |
| 套餐包生成纯音乐 | `GenBGM` | POST | `2024-08-12` |
| 查询生成任务 | `QuerySong` | POST | `2024-08-12` |
| 查询授权和用量 | `QueryUsage` | GET | `2024-08-12` |

公共信息：

```text
Endpoint: https://open.volcengineapi.com
Service: imagination
Region: cn-beijing
Model version: v5.0
```

官方资料：

- 纯音乐生成：<https://docs.volcengine.com/docs/84992/2100970?lang=zh>
- 查询任务：<https://docs.volcengine.com/docs/84992/2100960?lang=zh>
- API 快速接入：<https://www.volcengine.com/docs/84992/1404668>
- 服务开通与计费模式：<https://www.volcengine.com/docs/84992/1404662>
- SLA 与版权责任边界：<https://www.volcengine.com/docs/84992/1404653>

## 账号前提

官方接入指南要求企业实名认证账号。还需要在 AI 音乐生成大模型产品页开通下列一种计费方式：

- 按时长后付费，对应 `VOLCENGINE_MUSIC_BILLING_MODE=duration`；
- 预付套餐包，对应 `VOLCENGINE_MUSIC_BILLING_MODE=package`。

IAM 子账号需要“智能美化特效”相关权限。已有 VOD AK/SK 可以作为同一火山账号的签名凭据复用，但它本身不会自动开通 BigMusic 产品授权。

先运行只读预检，不产生音乐生成费用：

```bash
npm run smoke:music
```

预检调用 `QueryUsage`。返回项中的授权状态为：

- `production`：正式授权；
- `trial`：试用授权；
- `unknown`：需要检查产品开通、账号认证和 IAM 权限；
- 空数组：按时长后付费账号可能返回 `Result.Data=null`，表示没有预付资源包额度，并不等于后付费服务未开通。后付费开通状态以控制台“按时长计费 → 生成纯音乐 → 正式调用”为准。

产品刚开通时，`QueryUsage` 还可能短暂返回 `APINoSource`。`smoke:music` 会保持只读并报告失败；只有显式执行 `music:generate` 且配置为 `duration` 时，脚本才允许越过这项资源包检查并调用后付费生成接口，最终授权结果以 `GenBGMForTime` 响应为准。

## 本地配置

推荐复用已经安全保存在 `.env.local` 的 VOD IAM AK/SK：

```dotenv
MUSIC_PROVIDER=volcengine-bigmusic
VOLCENGINE_MUSIC_REGION=cn-beijing
VOLCENGINE_MUSIC_ENDPOINT=https://open.volcengineapi.com
VOLCENGINE_MUSIC_BILLING_MODE=duration
VOLCENGINE_MUSIC_DEFAULT_DURATION_SECONDS=60
VOLCENGINE_MUSIC_ENABLE_INPUT_REWRITE=false
VOLCENGINE_MUSIC_AIGC_WATERMARK=false
VOLCENGINE_MUSIC_REQUEST_TIMEOUT_MS=15000

# 为空时自动回退到 VOLCENGINE_VOD_ACCESS_KEY_ID/SECRET_ACCESS_KEY。
VOLCENGINE_MUSIC_ACCESS_KEY_ID=
VOLCENGINE_MUSIC_SECRET_ACCESS_KEY=
VOLCENGINE_MUSIC_SESSION_TOKEN=
```

如果音乐服务必须使用独立 IAM 子账号，则填写 `VOLCENGINE_MUSIC_*` 三个凭据变量。真实凭据只进入被 Git 忽略的 `.env.local` 或 Secret Manager。

`VOLCENGINE_MUSIC_COMMERCIAL_SAFETY_PREFIX` 默认值为：

```text
原创、无人声、非罐头背景纯音乐，不模仿任何现有歌曲、歌手、乐队或影视配乐；
```

该前缀会由 Provider 自动放在用户提示词之前，用于降低商业广告中的模仿和相似性风险。它是风险控制，不是“不侵权保证”。

## 对上层开放的 HTTP API

所有 `/v1/*` 路由继续受 `HARNESS_API_KEY` Bearer 鉴权保护。

### 1. 能力发现

```http
GET /v1/music/capabilities
```

返回模型、计费模式、时长范围、结构名称、默认值、URL 生命周期和版权校验错误码。上层应用应从该接口构建表单，不要把限制硬编码到多个客户端。

### 2. 授权与用量预检

```http
GET /v1/music/usage
```

这是只读调用，不生成音乐。建议在允许用户提交付费任务之前先调用一次。

注意：按时长后付费账号的成功响应可能是空数组，因为 `QueryUsage` 主要返回预付资源包额度。空数组不能单独证明后付费服务未开通。

### 3. 提交纯音乐任务

```http
POST /v1/music/tracks
Content-Type: application/json

{
  "prompt": "现代企业科技介绍片，温暖可信、克制高级，95 BPM，钢琴、轻电子节奏与柔和弦乐，给旁白留出中频空间，中段轻微推进，结尾干净自然。",
  "durationSeconds": 60,
  "segments": [
    { "name": "intro", "durationSeconds": 10 },
    { "name": "verse", "durationSeconds": 35 },
    { "name": "outro", "durationSeconds": 15 }
  ],
  "enablePromptRewrite": false,
  "implicitWatermark": {
    "enabled": true,
    "contentProducer": "Harmony",
    "produceId": "campaign-42"
  },
  "aigcWatermark": false
}
```

成功返回 HTTP `202`：

```json
{
  "provider": "volcengine-bigmusic",
  "model": "BigMusic-v5.0",
  "taskId": "202408308513817850019840",
  "status": "submitted",
  "requestId": "provider-request-id",
  "predictedWaitTimeSeconds": 0
}
```

### 4. 查询任务

```http
GET /v1/music/tracks/{taskId}
```

状态映射：

| 火山 `Status` | Harness 状态 |
| --- | --- |
| `0` 等待中 | `submitted` |
| `1` 处理中 | `running` |
| `2` 成功 | `succeeded` |
| `3` 失败 | `failed` |

成功任务包含 `audioUrl`、`durationSeconds`、`prompt`、`storagePath` 和已解析的 `styleInfo`。失败任务包含 `errorCode` 和 `errorMessage`。

### 5. 解析下载地址

```http
GET /v1/music/tracks/{taskId}/download
```

只有任务成功时返回地址。官方说明输出默认是 WAV，但因视频云转码链路也可能出现 MP4 等容器；提供方 URL 标称有效期一年，仅供转存，不应直接用于线上应用。生产流程必须立即下载、校验媒体格式并登记为 Project Asset。

## 请求参数完整映射

| Harness 参数 | 火山 Body 字段 | 类型/范围 | 缺省值 | 说明 |
| --- | --- | --- | --- | --- |
| `prompt` | `Text` | 中文，1–2000 字符 | 必填 | 场景、情绪、速度、乐器、叙事弧线和旁白空间 |
| `durationSeconds` | `Duration` | 整数，30–120 秒 | 60 | v5.0 总时长 |
| `segments[].name` | `Segments[].Name` | `intro/verse/chorus/inst/bridge/outro` | 无 | 仅 v5.0 |
| `segments[].durationSeconds` | `Segments[].Duration` | 每段 5–120 秒 | 无 | 总和必须 30–120；只有一段时该段至少 30 秒 |
| `enablePromptRewrite` | `EnableInputRewrite` | boolean | false | 是否允许模型改写提示词 |
| `storageBucket` | `TosBucket` | string | 无 | 用户自有火山 TOS 桶名 |
| `callbackUrl` | `CallbackURL` | HTTPS URL | 无 | 异步完成回调 |
| `implicitWatermark.enabled` | `ImplicitWaterMark.Enable` | boolean | 无 | 隐式水印开关 |
| `implicitWatermark.contentProducer` | `ContentProducer` | string | 无 | 生成合成服务提供者 |
| `implicitWatermark.produceId` | `ProduceId` | string | 无 | 内容制作编号 |
| `implicitWatermark.contentPropagator` | `ContentPropagator` | string | 无 | 内容传播服务提供者 |
| `implicitWatermark.propagateId` | `PropagateId` | string | 无 | 内容传播编号 |
| `aigcWatermark` | `AigcWatermark` | boolean | false | 提供方显式 AIGC 水印 |

时长优先级是：`Segments` 总和 > `Text` 中写出的时长 > 外层 `Duration`。因此推荐只在结构化字段里设置时长，不要在 `prompt` 重复写“60 秒”。

## 提示词模板

通用商业介绍片：

```text
现代企业科技介绍片，温暖可信、克制高级，95 BPM，钢琴、轻电子节奏与柔和弦乐；前奏快速建立氛围，中段逐步推进，结尾干净自然；编配稀疏，给中文旁白留出中频空间。
```

高端产品发布：

```text
高端产品发布片背景纯音乐，现代、精准、有未来感，100 BPM，柔和脉冲合成器、低频鼓点、钢琴点缀和轻弦乐；不喧闹，不抢旁白，层次缓慢增强，尾奏坚定收束。
```

品牌故事：

```text
品牌故事介绍片背景纯音乐，温暖、人文、真诚，82 BPM，原声钢琴、木吉他、轻打击乐与柔和弦乐；旋律克制，情绪由平静逐步走向希望，结尾留有余韵。
```

## 本地真实生成与转存

先预检：

```bash
npm run smoke:music
```

确认账号已经授权且接受对应计费后，生成并把提供方文件立即下载到本地：

```bash
npm run music:generate -- \
  --duration 60 \
  --output ./artifacts/background-music/company-intro.wav
```

自定义提示词：

```bash
npm run music:generate -- \
  --duration 60 \
  --prompt "现代企业介绍片背景纯音乐，温暖可信，95 BPM，钢琴、轻电子和柔和弦乐，给旁白留出空间，结尾干净。" \
  --output ./artifacts/background-music/company-intro.wav
```

脚本只有显式传入 `--generate`（`music:generate` 已包含）才会产生付费生成；`smoke:music` 永远只做只读预检。

## 旁白与背景音乐混音

生成音乐转存后，使用本地 FFmpeg 完成广告片混音：

```bash
npm run audio:mix -- \
  --video ./artifacts/master-4k.mp4 \
  --voiceover ./artifacts/voiceover-master.wav \
  --music ./artifacts/background-music/company-intro.wav \
  --output ./artifacts/final-with-voice-and-music.mp4
```

默认策略：

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| 音乐基础增益 | `-22 dB` | 给旁白预留空间 |
| 旁白增益 | `0 dB` | 保持通过审核的旁白母版 |
| 侧链压缩阈值 | `0.03` | 检测旁白活动 |
| 侧链压缩比 | `8:1` | 旁白出现时自动压低音乐 |
| Attack / Release | `20 / 500 ms` | 快速避让、自然恢复 |
| 淡入 / 淡出 | `1.5 / 3 s` | 避免硬切 |
| 成片响度 | `-16 LUFS` | 网络广告和介绍片默认值 |
| True Peak | `-1.5 dBTP` | 留出编码余量 |

可覆盖的 CLI 参数：

```text
--music-gain-db
--voiceover-gain-db
--target-lufs
--overwrite
```

音乐不足成片时长时会自动循环；音乐和旁白都被裁齐到视频时长。视频流使用 `-c:v copy`，只重新编码 AAC 音轨，不重复压缩 4K 画面。

## 版权与商业使用边界

不能把“AI 生成”解释为“绝对无版权风险”。本接入采用以下控制：

1. 只提交中文文字提示词，不上传或引用现有音乐；
2. 自动加入原创、无人声、禁止模仿的商业安全前缀；
3. 提示词禁止包含歌手、乐队、歌曲、影视作品或“仿某某风格”等要求；
4. 保留 Prompt、模型版本、任务 ID、请求 ID、生成时间、账单和原始下载文件；
5. 正式投放前仍需进行人工听审和音乐指纹/相似度检查；
6. 全国性或高预算广告如要求合同层面的侵权赔偿，应使用明确提供同步授权和赔偿条款的版权音乐库或委托原创。

火山官方文档提示，内容简单的 30 秒短音乐更容易触发版权校验，错误码为 `50000001`。Harness 将该错误标记为不可重试；应改写为更完整、更原创的提示词或延长时长，不能自动重复同一请求绕过校验。

火山服务条款不主张生成内容所有权，但也不保证生成内容不侵权；生成内容纠纷不属于 SLA 赔付范围。商业投放前应以企业实际签署的订单和合同为最终依据。

## 主要错误与处理

| 错误 | Harness 行为 | 建议 |
| --- | --- | --- |
| `50000001` | 终止，不自动重试 | 丰富原创描述、移除相似性诱导、适当延长时长 |
| `300061` / `InputLyricsPlagiarized` | 终止，不自动重试 | 本接入不使用歌词；检查 Prompt 是否引用现有作品 |
| AccessDenied / Unauthorized | 终止 | 检查企业认证、服务开通和 IAM 权限 |
| Throttling / FlowLimit / Timeout | 可重试 | 指数退避后重试 |
| URL 已失效或格式不符 | 终止 | 重新查询/生成并立即转存，使用 ffprobe 核验容器 |

## 代码位置

- 领域契约：`src/domain/music-provider.ts`
- 火山 Provider：`src/providers/volcengine-bigmusic-provider.ts`
- HTTP 路由：`src/http/server.ts`
- OpenAPI：`src/http/openapi.ts`
- 只读预检/真实生成：`scripts/smoke-volcengine-music.ts`
- 商业混音：`src/application/commercial-audio-mixer.ts`
- 混音 CLI：`scripts/mix-commercial-audio.ts`
- Provider 测试：`test/volcengine-bigmusic-provider.test.ts`
- 混音测试：`test/commercial-audio-mixer.test.ts`
