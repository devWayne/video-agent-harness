# Qwen Audio 3.0 商业广告旁白 API

## 范围与结论

Harness 通过阿里云百炼华北 2（北京）的非实时 HTTP 接口接入
`qwen-audio-3.0-tts-plus`。该模型用于商业广告旁白、有声内容和影视配音；当前实现不是实时对话接口，也不负责背景音乐生成或最终混音。

```text
上层广告应用
  → GET  /v1/voiceovers/capabilities 发现参数和默认值
  → POST /v1/voiceovers              合成旁白
  → 立即把 24 小时临时音频 URL 导入项目资产/OSS
  → 后期混音、响度标准化、音乐闪避和视频封装
```

官方资料：

- 模型与场景：<https://help.aliyun.com/zh/model-studio/qwen-audio-3-0-tts-plus>
- HTTP API：<https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api>
- 系统音色：<https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list>
- 计费：<https://help.aliyun.com/zh/model-studio/model-pricing>

## 配置

本服务复用已经配置的北京地域百炼 Workspace 域名和 API Key。Key 只保存在被 Git 忽略的 `.env.local`；上层应用只调用 Harness，不应取得百炼 Key。

```dotenv
BAILIAN_WORKSPACE_ID=...
BAILIAN_BASE_URL=https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1
BAILIAN_API_KEY=...

VOICEOVER_PROVIDER=bailian-qwen-audio
BAILIAN_TTS_MODEL=qwen-audio-3.0-tts-plus
BAILIAN_TTS_VOICE=longanlingxin
BAILIAN_TTS_FORMAT=wav
BAILIAN_TTS_SAMPLE_RATE=48000
BAILIAN_TTS_ENABLE_AIGC_TAG=true
BAILIAN_TTS_REQUEST_TIMEOUT_MS=120000
```

`BAILIAN_TTS_DEFAULT_INSTRUCTION` 是可覆盖的系统级默认导演指令。缺省值面向克制、自然、有感染力的商业广告旁白，并要求品牌名和结尾口号适度加重。

## 鉴权

若设置了 `HARNESS_API_KEY`，两个 `/v1/voiceovers*` 接口都使用 Harness 自己的 Bearer Key：

```http
Authorization: Bearer <HARNESS_API_KEY>
```

这不是百炼 API Key。Harness 在服务端使用 `BAILIAN_API_KEY` 调用百炼，日志会对相关字段脱敏。

## 能力查询

```http
GET /v1/voiceovers/capabilities
```

返回当前 Provider、模型、地域、临时 URL 生命周期、真实默认值、系统音色、支持格式、采样率、语言提示以及功能开关。上层应用应优先读取此接口生成表单，不要复制一份容易过期的枚举。

当前旗舰系统音色：

| `voice` | 名称 | 官方特质 | 广告建议 |
|---|---|---|---|
| `longanlingxin` | 龙安灵心 | 25 岁女性，知心温暖音 | 品牌叙事、生活方式、服务类广告 |
| `longanlufeng` | 龙安鲁风 | 25 岁男性，明亮开朗音 | 产品发布、科技、年轻化广告 |

模型也接受与 `qwen-audio-3.0-tts-plus` 绑定的基础音色和复刻音色 ID。音色不能跨模型混用。

## 生成旁白

```http
POST /v1/voiceovers
Content-Type: application/json
```

最小请求：

```json
{
  "text": "每一次出发，都值得更好的抵达。让灵感被看见，让好创意真正发生。"
}
```

商业广告完整示例：

```json
{
  "text": "此刻，城市正在醒来。全新 Bettr，让每一次增长都有回响。",
  "voice": "longanlingxin",
  "instruction": "高端科技品牌广告旁白。自然、成熟、克制，前半段留有呼吸；Bettr 清晰加重，结尾坚定但不喊叫。",
  "format": "wav",
  "sampleRate": 48000,
  "volume": 50,
  "rate": 0.95,
  "pitch": 1,
  "seed": 7,
  "languageHints": ["zh"],
  "enableSsml": false,
  "enableAigcTag": true,
  "aigcPropagator": "video-harness-ad-service",
  "aigcPropagateId": "campaign-2026-001-take-01",
  "hotFix": {
    "pronunciation": [
      { "source": "Bettr", "target": "better" }
    ],
    "replace": [
      { "source": "AIGC", "target": "A I G C" }
    ]
  }
}
```

### 请求参数

| 参数 | 类型 | 缺省值 | 约束与语义 |
|---|---|---|---|
| `text` | string | 必填 | 待合成正文；1–20,000 字符。超长广告应按语义段落拆分并在后期拼接。 |
| `voice` | string | 配置值 | 系统、基础或自定义音色 ID；必须与 Plus 模型绑定。 |
| `instruction` | string | 商业广告默认指令 | 1-128 字；自然语言导演指令，控制情绪、角色、语速、方言和表演风格。 |
| `format` | enum | `wav` | `mp3`、`pcm`、`wav`、`opus`。后期制作建议 WAV。 |
| `sampleRate` | integer | `48000` | 8000、16000、22050、24000、44100、48000 Hz。 |
| `volume` | integer | `50` | 0–100。不要用它替代最终响度标准化。 |
| `rate` | number | `1` | 0.5–2.0 的语速倍率。商业旁白常用 0.9–1.05。 |
| `pitch` | number | `1` | 0.5–2.0 的音调倍率。应小幅调整，避免破坏真人感。 |
| `bitRate` | integer | 无 | 6–510 kbps；当前 HTTP Profile 仅允许和 `opus` 一起使用。 |
| `seed` | integer | `0` | 0–65535。同模型版本和同输入下帮助复现；上游升级后不保证逐样本一致。 |
| `languageHints` | string[] | `["zh"]` | 只允许一个值；百炼当前只处理第一项。枚举见 OpenAPI。 |
| `enableSsml` | boolean | `false` | 为 true 时将 `text` 按受支持的 SSML 解析。普通广告优先使用自然语言指令。 |
| `enableAigcTag` | boolean | `true` | 在 WAV/MP3/Opus 中嵌入百炼隐性 AIGC 标识；商业流程默认开启。 |
| `aigcPropagator` | string | 阿里云 UID | 自定义隐性标识的 `ContentPropagator`；要求开启 AIGC 标识。 |
| `aigcPropagateId` | string | 请求 ID | 一次传播行为的业务 ID；要求开启 AIGC 标识。 |
| `hotFix.pronunciation` | array | 无 | `{source,target}`；`target` 使用带声调数字的拼音修正发音。 |
| `hotFix.replace` | array | 无 | `{source,target}`；合成前进行逐项文本替换。 |

语言提示枚举：`zh`、`en`、`fr`、`de`、`ja`、`ko`、`ru`、`pt`、`th`、`id`、`vi`、`es`、`it`、`ms`、`fil`、`ar`。系统音色当前以普通话和英语为主；更多语言通常需要相应的复刻音色。

字级时间戳是上游流式接口能力，当前非流式广告制作路由不暴露该参数。需要精确字幕对齐时，应新增流式 Provider，而不是给本接口发送无效字段。

### 返回参数

```json
{
  "provider": "bailian-qwen-audio",
  "model": "qwen-audio-3.0-tts-plus",
  "requestId": "provider-request-id",
  "audioUrl": "https://temporary-signed-url.example/audio.wav",
  "audioId": "audio-provider-id",
  "expiresAt": "2026-08-23T12:00:00.000Z",
  "billedCharacters": 42,
  "voice": "longanlingxin",
  "format": "wav",
  "sampleRate": 48000
}
```

| 字段 | 说明 |
|---|---|
| `requestId` | 百炼请求 ID，用于账单、日志和工单关联。 |
| `audioUrl` | 百炼临时下载地址，官方生命周期为 24 小时。不得作为项目永久资产 URL。 |
| `audioId` | 上游音频对象 ID。 |
| `expiresAt` | 临时 URL 的明确过期时间。 |
| `billedCharacters` | 百炼返回的实际计费字符数。阿里计费口径下一个汉字通常计两个字符。 |

## 错误与重试

| HTTP | 含义 | 上层策略 |
|---|---|---|
| 400 | Harness 参数校验失败 | 修正文案或参数，不重试原请求。 |
| 401 | Harness API 鉴权失败 | 更换 Harness Key；不要把百炼 Key 发给客户端。 |
| 502 | 百炼拒绝参数或返回结构异常 | 记录 `code`、`requestId`，修正模型/音色组合。 |
| 503 | 未配置、网络失败、429 限流或上游 5xx | 按指数退避重试；生成可能计费，业务层应保存请求关联 ID。 |

当前百炼非实时 Qwen Audio TTS 的提交限流应以官方限流页和账号配额为准。上层应用不要以批量并发方式盲目重试 429。

## 商业制作建议

1. 先按语义拆成 1–3 句一个 Take，避免整支广告一次生成导致局部不可重做。
2. 同一段使用不同 `seed` 生成 2–3 个 Take；由人工或质量 Agent 选择，不自动取第一条。
3. 品牌名、型号和中英混读通过 `hotFix` 验收，不要依赖默认读音。
4. 使用 48 kHz WAV 作为母版；音乐闪避、峰值限制和目标 LUFS 在后期完成。
5. 立刻将临时 URL 导入私有 OSS，并把 `requestId`、指令、音色、seed、计费字符数记录到资产血缘。
6. 复刻真人音色前取得可审计的书面授权；不要复刻未授权公众人物或员工声音。

## 烟测

真实烟测会产生少量 TTS 费用，必须显式确认：

```bash
TTS_SMOKE_CONFIRM_PAID=YES npm run smoke:voiceover
```

默认输出为：

```text
artifacts/voiceovers/qwen-audio-3.0-tts-plus-smoke.wav
```

可通过 `TTS_SMOKE_TEXT`、`TTS_SMOKE_OUTPUT` 覆盖文案和输出位置。脚本不会打印 API Key 或完整临时签名 URL。

## 按导演时间轴批量生成

生产项目不要把整片旁白作为一个不可重做的请求。仓库提供可恢复的时间轴批量命令：

```bash
npm run voiceover:render-manifest -- \
  --manifest /absolute/path/tts-director-manifest.json \
  --output-dir /absolute/path/voiceover-output \
  --video /absolute/path/master-4k.mp4 \
  --output-video /absolute/path/master-4k-voiceover.mp4 \
  --confirm-paid YES
```

导演清单按 Cue 保存 `startSeconds`、`endSeconds`、帧号、字幕、TTS 文本、语气和重音。命令逐条生成 48 kHz PCM 16-bit 单声道 WAV，并在每条成功后立即保存不含密钥和临时 URL 的收据；重启后只继续缺失 Cue。原始朗读超过画面窗口时，只对该 Cue 做最小必要的 `atempo` 适配；不足部分补静音。最终旁白轨按视频主时钟合成，封装时复制视频流，不重复编码 4K 画面。

输出目录保留：

- `takes-raw/`：百炼返回的每条原始 WAV；
- `takes-conformed/`：与导演时间窗对齐的 WAV；
- `voiceover-render.receipt.json`：请求 ID、音频 ID、计费字符、哈希、原始时长和适配倍率；
- 48 kHz 单声道旁白母带；
- 可选的 4K + AAC 旁白交付 MP4。

`instruction` 的百炼真实上限为 128 字；Domain Schema、OpenAPI 和批量脚本均在提交前执行相同校验，避免用无效请求触发云端错误。

## Bettr 长片实证（2026-08-22）

| 项目 | 结果 |
| --- | --- |
| Cue 数 | 29，全部 `ready` |
| 模型 / 音色 | `qwen-audio-3.0-tts-plus` / `longanlingxin` |
| 母带 | 48 kHz、PCM 16-bit、单声道 WAV、118.333333 秒 |
| 正常计费字符 | 766 |
| 废弃重试字符 | 32 |
| 估算云端总字符 | 798 |
| 最终封装 | 3840×2160、24 fps、H.264 画面 + 48 kHz AAC 单声道、118.333333 秒 |

这次实证确认：长片旁白不应一次生成整轨。Cue 级请求、原始/适配 Take、计费和哈希收据让单句发音或节奏问题可以局部重做；最终以画面时钟合成母带，并通过视频流复制加入已完成的 4K 母版。

## OpenAPI

运行 Harness 后，机器可读契约位于：

```text
GET /openapi.json
```

`CreateVoiceover`、`VoiceoverResult` 和 `VoiceoverCapabilities` 包含所有已暴露字段、枚举、范围、默认值和说明；它们是上层应用集成时的主契约。本文件提供制作语义和运维边界，不能取代机器契约。
