# 第三方 Skill 依赖

本仓库把创作流程所需 Skill 一起版本化，以便 Codex、Claude Code 或其他 Agent Host 在克隆仓库后使用同一套知识与操作边界。

| Skill | 来源 | 仓库位置 | 维护策略 |
| --- | --- | --- | --- |
| `grill-me` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) | `skills/grill-me/` | 保留原能力意图，并适配为跨 Host 的逐问式规格压力测试；不包含已删除的 `drill-me` |
| `libtv-cli` | LibTV 官方 CLI Skill 1.1.3 | `skills/libtv-cli/` | 官方文档快照；实际命令与参数以本机 `libtv --help` 和实时 Model Schema 为准 |

以下内容明确不进入仓库：

- Codex `.system` Skills 与插件缓存；
- `~/.libtv/credentials.json`、浏览器 Cookie、手机号码和验证码；
- `.libtv/project.json` 中的本机工作区/画布绑定；
- 用户级 `~/.codex/skills` 目录本身。

`npm run skills:install -- --host=codex|claude` 会从仓库 `skills/` 安装项目副本；仓库目录始终是本项目 Skill 的唯一可发布源。
