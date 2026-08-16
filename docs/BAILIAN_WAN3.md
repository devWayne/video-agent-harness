# 阿里云百炼 Wan 3.0 接入基线

> 控制台核对日期：2026-08-16。厂商能力、价格和限流可能调整，上线前需重新校验。

## 已确认配置

| 配置 | 值 |
| --- | --- |
| 地域 | 华北 2（北京） |
| 模型 Code | `wan3.0-video` |
| 任务接口 | `POST https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis` |
| 鉴权 | `Authorization: Bearer ${DASHSCOPE_API_KEY}` |
| 异步请求头 | `X-DashScope-Async: enable` |
| 控制台限流 | 50 RPM |

请求体最小形态：

```json
{
  "model": "wan3.0-video",
  "input": {
    "prompt": "一只小猫在月光下的屋顶上奔跑，电影级画质，流畅运镜。"
  },
  "parameters": {
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 5
  }
}
```

Provider 不应把 `workspace_id` 或 API Key 写死在代码里。建议运行时变量：

```dotenv
BAILIAN_REGION=cn-beijing
BAILIAN_WORKSPACE_ID=
BAILIAN_API_KEY=
BAILIAN_WAN_MODEL=wan3.0-video
```

## 能力与成本基线

- 支持文本、图片、视频、音频四模态参考，以及参考、编辑、复刻、驱动等创作方式。
- 单次最长 30 秒；控制台提供 480P、720P、1080P。
- 当前控制台标价：480P 为 0.3 元/秒，720P 为 0.6 元/秒，1080P 为 1.2 元/秒。
- Harness 的生产默认是 16:9、3840×2160；模型素材以 1080P 生成，再进入超分、修复和母版合成流程。

## 当前账号状态

- 默认业务空间已存在。
- Wan 3.0 开通申请已提交，控制台当前显示“申请中”。
- 已创建描述为 `video-agent-harness` 的项目专用 API Key，权限仅包含万相 3.0 视频生成。
- 新 Key 的明文仅保存在 `.env.local`；该文件已被 `.gitignore` 排除，禁止复制到文档、日志或版本控制。
- 开发阶段 IP 白名单暂时允许 IPv4/IPv6 全部来源；获得生产出口 IP 后必须收紧。
