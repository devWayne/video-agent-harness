# AI 音乐 Provider 调研与落地决策

更新时间：2026-08-22

## 结论

在阿里云百炼和火山方舟的官方模型目录及文档中，均未发现由云厂商正式托管、以官方模型 ID 和官方 API 提供的 **Suno** 服务。因此 Harness 不接入 Suno，也不使用网上的第三方 Suno API 封装。

除文档检索外，本次还使用现有账号做了只读模型目录核查：百炼 `GET /api/v1/models?name=suno` 返回 0 个结果；同一接口查询 `fun-music` 能正常返回两个模型，证明查询链路有效。火山方舟 `GET /api/v3/models` 返回 130 个当前可见模型，其中 `suno` 和 `music` 名称匹配均为 0。

2026-08-22 产品决策更新：广告/企业介绍片需要的是原创无人声背景音乐，不要求 Suno 品牌。Harness 因此选择火山引擎原生 BigMusic v5.0 纯音乐 OpenAPI，保留完整生成记录并在投放前执行相似度检查。完整接入见 [`VOLCENGINE_BIGMUSIC.md`](./VOLCENGINE_BIGMUSIC.md)。

## 阿里云百炼

百炼当前有原生音乐生成模型 **Fun-Music**，不是 Suno：

- 模型：`fun-music-v1`、`fun-music-preview`
- 能力：中文/英文完整歌曲、纯音乐、提示词或歌词输入、流式和非流式输出
- 地域：华北 2（北京）
- 状态：官方文档标记为邀测，需要先在模型广场申请
- 价格：`fun-music-v1` 0.002 元/输出秒，`fun-music-preview` 0.005 元/输出秒，具体以控制台为准

官方资料：

- <https://help.aliyun.com/zh/model-studio/fun-music>
- <https://help.aliyun.com/zh/model-studio/model-pricing>
- <https://help.aliyun.com/zh/model-studio/list-models>

现有北京地域百炼 API Key 原则上可以调用同一业务空间内已获授权的模型，但 Fun-Music 邀测权限需要单独申请。当前不把它作为主 Provider，仅在火山服务无法满足质量或产能要求时重新评估。

## 火山引擎

火山产品目录中存在原生 AI 音乐生成大模型，也不是 Suno。正式 API 位于独立的 `imagination/cn-beijing` OpenAPI 服务，不在火山方舟 `/api/v3/models` 目录中。当前已接入：

- v5.0 纯音乐：`GenBGMForTime` / `GenBGM`；
- 任务查询：`QuerySong`；
- 授权与额度预检：`QueryUsage`；
- 30–120 秒和分段结构；
- 商业原创安全前缀、版权校验错误映射和生成记录；
- 本地 FFmpeg 旁白闪避与成片混音。

官方资料：

- <https://www.volcengine.com/product/doubao/>
- <https://www.volcengine.com/docs/82379/1554712?lang=zh>
- <https://www.volcengine.com/docs/84992/1404662>
- <https://docs.volcengine.com/docs/84992/2100970?lang=zh>
- <https://docs.volcengine.com/docs/84992/2100960?lang=zh>

Seedance 生成的同步声音仍不作为独立、可导演、可复用的广告配乐 Provider。

## 为什么不使用第三方 “Suno API”

搜索结果中的 `chirp-*`、`sunoapi.*` 或其他 “Suno API” 域名不能自动视为 Suno 官方服务。接入商业广告系统前至少需要同时满足：

1. Suno 或云厂商可核验的官方 API 文档和 Endpoint；
2. 明确覆盖付费广告、客户项目和批量生成的商业授权；
3. 可审计的训练/输出权利链与服务协议；
4. 稳定的企业账号、限流、账单、SLA 和数据处理条款。

当前两家云平台没有满足上述条件的 Suno 托管服务，故不创建 Provider、环境变量、接口或 UI 占位。

## 重新评估触发条件

仅在以下任一条件出现后重新评估：

- 阿里云百炼或火山方舟官方模型列表新增 Suno，并提供明确模型 ID、API 和商业条款；
- Suno 发布可直接签约和调用的官方生产 API；
- 火山 BigMusic 无法满足代表性介绍片的质量、并发或版权审查要求；
- 产品明确决定改用 Fun-Music 或其他具备更强商业授权条款的原生模型。
