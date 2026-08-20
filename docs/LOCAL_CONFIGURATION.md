# 本地配置与远程仓库边界

项目 Skill 的唯一源文件位于仓库的 `skills/`。项目自有 Skill、适配后的 `grill-me` 与 LibTV 官方 CLI Skill 快照都从这里安装，可以进入 GitHub/GitLab 并通过代码评审和 CI 管理。不要直接修改用户主目录下的 Skill 副本。

## Agent Host 安装

在仓库根目录运行：

```bash
npm run skills:install -- --host=codex
npm run skills:install -- --host=claude
```

安装器默认把 `.agents/skills/<skill>` 和 `.claude/skills/<skill>` 建成指向仓库 `skills/<skill>` 的相对符号链接。因此只需要修改 `skills/` 这一处，Codex 与 Claude Code 会立即读取同一份内容。两个目标目录均被 Git 忽略；可移植、可提交的唯一源文件始终是 `skills/`。

在不支持符号链接的环境中，可显式安装独立副本：

```bash
npm run skills:install -- --host=all --copy
```

副本模式不会自动同步后续修改，因此日常开发应使用默认链接模式。重新执行默认命令即可把副本恢复为链接。不要直接编辑 `.agents/skills/` 或 `.claude/skills/` 下的内容。

## 可以提交的内容

- `skills/**/SKILL.md`、Skill references 和无密钥模板；
- TypeScript 领域契约、Provider 接口和 Workflow Profile Schema；
- `.env.example` 中的变量名与空值；
- 不含账号、内网地址和素材的测试夹具。

## 只能保留在本机的内容

- `.env.local`、AccessKey、API Key、Bearer Token、Cookie 和登录会话；
- ComfyUI 的局域网地址、端口和本机 Workflow 绝对路径；
- LibTV Project UUID、画布 URL 和 CLI 登录状态；
- 阿里云账号、Bucket、工作空间 ID 和本地素材路径；
- `.data/` 中的 SQLite、Manifest、中间视频和控制资产；
- `.claude/settings.local.json` 及其他宿主私有授权配置。

提交前至少运行：

```bash
git status --short
git diff --cached -- .env .env.local
git grep -nE '(ACCESS_KEY|API_KEY|SECRET|TOKEN)=.+' -- ':!package-lock.json'
```

`.gitignore` 是最后一道保护，不是密钥管理方案。真实凭据只通过被忽略的 `.env.local`、操作系统凭据链或企业 Secret Manager 注入。
