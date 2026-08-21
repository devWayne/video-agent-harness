# Doubao Seedance 2.5：Video Agent Harness 接入手册

更新时间：2026-08-22

## 1. 当前接入结论

Video Agent Harness 已通过火山方舟视频生成 API 接入 Doubao Seedance 2.5。当前工程 Profile：

| 项目 | 值 |
| --- | --- |
| Provider | `volcengine-seedance` |
| 模型 ID | `doubao-seedance-2-5-260628` |
| Base URL | `https://ark.cn-beijing.volces.com/api/v3` |
| 创建任务 | `POST /contents/generations/tasks` |
| 查询任务 | `GET /contents/generations/tasks/{id}` |
| 取消/删除 | `DELETE /contents/generations/tasks/{id}` |
| 鉴权 | `Authorization: Bearer $ARK_API_KEY` |
| Harness 已验证分辨率 | `480P`、`720P` |
| Harness 已验证时长 | 4–30 秒 |
| 默认比例 | `16:9` |
| 默认水印 | 关闭 |

火山方舟控制台当前已显示 Doubao Seedance 2.5 全面开放。公开 API 文档的部分参数备注仍只列 Seedance 2.0/1.5；工程因此区分：

- **官方通用 API 契约**：创建、查询、取消、异步状态、输出 URL、usage。
- **本项目真实验证 Profile**：上述 2.5 模型 ID、4–30 秒、480P/720P、多模态输入和同步音频。

不要根据旧版文档擅自放开 1080P 或改变时长边界；需要先用最小付费烟测验证新 Profile，再更新代码和本文档。

## 2. 与 AIGC 4K 的关系

Seedance 2.5 和 VOD AIGC 4K 是两个独立服务：

```text
ARK_API_KEY
  → Seedance 2.5
  → 生成 480P/720P 镜头

VOD IAM AK/SK
  → 上传最终 720P/1080P 母版
  → AIGC Standard 4K
  → 3840×2160 成片
```

Seedance Provider 不会读取 VOD AK/SK；VOD 也不能使用 `ark-...` Key。当前产品策略是先生成、评审和组装，再对最终母版做一次 4K，避免每个候选都付 4K 费用。

## 3. 配置

```dotenv
GENERATION_PIPELINE=direct
VIDEO_PROVIDER=volcengine

ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_API_KEY=your-ark-api-key
ARK_SEEDANCE_MODEL=doubao-seedance-2-5-260628
ARK_WATERMARK=false

DIRECT_GENERATION_RESOLUTION=720P
PROVIDER_POLL_INTERVAL_MS=2000
PROVIDER_TIMEOUT_MS=1200000
```

Key 只放在 Git 忽略的 `.env.local` 或部署平台 Secret 中。Provider 日志、SQLite、Manifest、OpenAPI 和前端 Workspace 响应都不应包含 Key。

## 4. 提交请求

最小文生视频请求：

```json
{
  "model": "doubao-seedance-2-5-260628",
  "content": [
    {
      "type": "text",
      "text": "电影感产品广告，16:9，稳定镜头，主体动作连贯"
    }
  ],
  "generate_audio": true,
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5,
  "watermark": false
}
```

HTTP：

```http
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Authorization: Bearer <ARK_API_KEY>
Content-Type: application/json
```

成功返回异步任务 ID：

```json
{
  "id": "cgt-..."
}
```

Harness 在返回后立即持久化 `cgt-...`，进程重启时继续查询，不重新提交已记录任务。

## 5. 多模态输入映射

| Harness 引用 | 方舟 `content` | `role` |
| --- | --- | --- |
| Prompt | `{ "type": "text", "text": "..." }` | 无 |
| 普通参考图 | `image_url` | `reference_image` |
| 首帧图 | `image_url` | `first_frame` |
| 尾帧图 | `image_url` | `last_frame` |
| 参考视频 | `video_url` | `reference_video` |
| 参考音频 | `audio_url` | `reference_audio` |

示例：

```json
{
  "content": [
    {
      "type": "text",
      "text": "保持产品外形一致，镜头从全景缓慢推进到特写"
    },
    {
      "type": "image_url",
      "image_url": { "url": "https://example.com/first.png" },
      "role": "first_frame"
    },
    {
      "type": "image_url",
      "image_url": { "url": "https://example.com/product.png" },
      "role": "reference_image"
    },
    {
      "type": "video_url",
      "video_url": { "url": "https://example.com/motion.mp4" },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": { "url": "https://example.com/music.mp3" },
      "role": "reference_audio"
    }
  ]
}
```

代码会把 `purpose: first-frame / first frame / first_frame` 统一为 `first_frame`，尾帧同理；同一请求最多各一张首帧和尾帧。所有素材 URL 必须在任务处理期间能被方舟服务端读取。

## 6. 参数与项目约束

| 参数 | 当前 Harness 行为 |
| --- | --- |
| `model` | 必须匹配 `doubao-seedance-2-5...`，避免误用未经验证版本 |
| `duration` | 4–30 的整数秒 |
| `resolution` | `480P/720P` 转为 API 的 `480p/720p` |
| `ratio` | 由 Shot Recipe 传入；当前生产主路径为 16:9 |
| `generate_audio` | 从请求透传，支持生成同步音频 |
| `watermark` | 全局由 `ARK_WATERMARK` 控制 |
| `seed` | 当前 Domain Contract 尚未暴露；需要可复现控制时再扩展 |
| `callback_url` | 当前不使用；Runtime 采用轮询和持久检查点 |
| `return_last_frame` | 当前未暴露；连续镜头可在后续 Profile 中增加 |

为什么默认 720P：当前真实 Profile 已验证 720P，最终交付另走 VOD AIGC 4K。配置成 `VIDEO_PROVIDER=volcengine + DIRECT_GENERATION_RESOLUTION=1080P` 会在启动时失败，防止把未验证组合送入付费 API。

## 7. 任务生命周期

查询：

```http
GET /api/v3/contents/generations/tasks/{id}
Authorization: Bearer <ARK_API_KEY>
```

状态归一化：

| 方舟状态 | Harness 状态 | 动作 |
| --- | --- | --- |
| `queued` | `submitted` | 继续轮询 |
| `running` | `running` | 继续轮询 |
| `succeeded` | `succeeded` | 读取 `content.video_url` |
| `failed` | `failed` | 保存 error code/message |
| `cancelled/canceled` | `failed` | 终止 |
| `expired` | `failed` | 标记 `VOLCENGINE_TASK_EXPIRED` |

取消请求使用 `DELETE`。官方文档说明排队中的任务可取消；对运行中任务不应假定一定能中止或免除费用。

官方 API 文档注明任务 ID/结果只保留有限时间（当前说明为创建后 7 天）。`video_url` 也是带时效签名的 TOS 地址。因此：

- 成功后必须尽快转存到自有私有存储。
- 不把 Provider 临时 URL 当永久资产。
- Manifest 只保留脱敏后的血缘信息，不持久化 URL 查询签名。

## 8. 错误与重试

| 情况 | Harness 行为 |
| --- | --- |
| HTTP 429 / `QuotaExceeded` | 标记可重试，等待并继续已有任务策略 |
| HTTP 5xx / 网络失败 | 标记可重试；“请求是否已被服务端接受”可能未知 |
| 输入文本/图片敏感 | 保存 Provider 错误，不盲目重试相同输入 |
| 输出视频敏感 | 保存 Provider 错误，需修改创意或素材 |
| 未知任务状态 | 可重试错误，避免错误判定成功 |
| 成功但没有 `video_url` | 契约错误，不进入交付 |

网络在提交响应前断开是最危险的边界，因为服务端可能已经创建付费任务。当前 Provider 依赖业务检查点在拿到 `cgt-...` 后防重；若要做到跨网络未知状态的严格幂等，需要方舟 API 提供并接入服务端幂等字段，不能自行假定。

## 9. 测试

离线契约测试，不访问云端、不产生费用：

```bash
npm test -- test/volcengine-seedance-provider.test.ts test/config.test.ts
```

真实烟测默认提交 4 秒、480P、16:9、有声视频，会产生费用：

```bash
npm run smoke:seedance
```

可覆盖：

```dotenv
SEEDANCE_SMOKE_PROMPT=
SEEDANCE_SMOKE_DURATION_SECONDS=4
SEEDANCE_SMOKE_RESOLUTION=480P
```

付费烟测前应确认：

1. API Key 属于正确火山账号和项目。
2. Seedance 2.5 已开通且配额可用。
3. 只使用最短时长和最低已验证分辨率。
4. 日志中不打印 Authorization、完整输入签名 URL或输出签名 URL。
5. 成功后立即下载/转存产物。

## 10. 与 4K 交付串联

推荐生产链路：

```text
Brief / Story / Shot Recipe
  → Seedance 2.5 生成多个 720P 候选
  → 质量评审与局部重做
  → 选中镜头持久化
  → 组装并锁定 720P/1080P 画面母版
  → VOD AIGC Standard 4K
  → 分 Cue 旁白、混音与私有 4K 成片
```

4K 完整配置、CLI、恢复语义、无播放域名下载和真实验收见 [`VOLCENGINE_VOD_AIGC_4K.md`](./VOLCENGINE_VOD_AIGC_4K.md)。

### Bettr 长片实证（2026-08-22）

- 输入：28 页 PDF 关键帧和编导 Prompt；先用 H3 做代表镜头试验。
- 路由决策：终稿级 A/B 后采用 `direct-keyframes`，没有把 H3 控制视频传入正式 Seedance 长片任务。
- 分段：27 个原子镜头被编为 9 个 15 秒云端段，每段覆盖 3 个镜头和 4 个相邻关键帧。
- 连贯性：相邻段共享一张权威 PDF 边界页；本地恢复精确首尾端点，各段使用 13.5 秒并以 0.4 秒交叉过渡。
- 画面锁定：1280×720、24 fps、H.264、118.333 秒、无音频。
- 所有云端原始段、后处理段、任务关联、Prompt、参考角色和 QA Contact Sheet 均保留在本地项目目录，不进入 Git。

这次结果把“控制草稿”和“终稿输入”进一步分开：H3 可以验证运动语法，但只有终稿模型上的 A/B 才能决定是否采用控制视频。

## 11. 官方资料

- [创建视频生成任务 API](https://www.volcengine.com/docs/82379/1520757?lang=zh)
- [查询视频生成任务 API](https://www.volcengine.com/docs/82379/1521309?lang=zh)
- [查询视频生成任务列表](https://www.volcengine.com/docs/82379/1521675?lang=zh)
- [取消或删除视频生成任务](https://www.volcengine.com/docs/82379/1521720?lang=zh)
- [火山方舟视频生成 API Explorer](https://api.volcengine.com/api-explorer/?action=CreateContentsGenerationsTasks&groupName=%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90API&serviceCode=ark&version=2024-01-01)
- [火山方舟 API Key 管理](https://console.volcengine.com/ark/apiKey)
