# Skills 与工程映射

> 实证回刷：2026-08-22

## 1. 层级关系

```text
Codex GPT（当前主 Agent Host，可替换）
└── create-production-video（全流程总导演 Skill）
    ├── design-character-reference-pack（人物造型与多角度定版）
    ├── direct-aigc-motion-graphics（PDF/UI/数据图的动效导演）
    ├── generate-minimax-h3-shot（ComfyUI/H3 控制草稿执行方法）
    ├── review-video-candidate（分阶段评审、A/B 与重试诊断）
    ├── libtv-cli（官方画布/模型操作协议，可选）
    └── Harness Runtime（类型化执行能力、账本、门禁、恢复和交付）
```

总 Skill 决定“做什么、用哪条路线、结果是否接受”；子 Skill 固化专业方法；Runtime 保存事实并提供执行能力。Runtime 里的 Pi/Deterministic Director 只是旧 `/v1/video-jobs` 兼容逻辑，不是当前主 Agent。

## 2. 生产阶段映射

| 阶段 | 主 Skill / 决策者 | Harness 契约或工具 | 外部执行面 | 当前实证 |
| --- | --- | --- | --- | --- |
| Brief、脚本、旁白规划 | `create-production-video` + Codex | Production Plan、Narration Cue Manifest | Codex | Bettr 28 页内容拆为 27 镜头、29 Cue |
| 人物造型 | `design-character-reference-pack` | Project Asset、Character Pack | Agent Host 图像生成 | 能力已实现；Bettr 不是人物主导案例 |
| PDF/UI 动效分镜 | `direct-aigc-motion-graphics` | `AigcMotionGraphicIntent`、三版本策略 | Codex | Bettr 使用结构/动态/高端三种方向试验 |
| 路线 A/B | 总 Skill + `review-video-candidate` | Production Run Record、Review | Seedance + H3 | Bettr 最终选择 direct-keyframes，未沿用 H3 底板 |
| 可选控制草稿 | `generate-minimax-h3-shot` | Workflow Profile、control Operation | ComfyUI / MiniMax H3 | FL2VA/REF2VA 真实生成；新 Operation 自动执行仍待接入 |
| 终稿生成 | 总 Skill | final-render Operation；Direct Provider；批处理 Manifest | Seedance / LibTV 模型 / Wan / MiniMax cloud | Seedance 2.5 已用于 9 段正式成片；Wan 2.7 仅真实烟测；LibTV 闭环待验收 |
| 看片与局部重做 | `review-video-candidate` + Codex/人工 | Evaluation Report、Operation Review | ffprobe、证据帧、Agent 视觉理解 | 技术检查和人工/Codex 评审已用；独立 VLM 服务未实现 |
| 串片与画面锁定 | 总 Skill | EditorialTimeline、候选版本、标记、picture revision/lock | OpenChatCut + HyperFrames/本地确定性媒体工具 | 时间线契约与 OpenChatCut MCP adapter 已实现；Bettr 既有成片用本地工具锁版 |
| 4K | 总 Skill + Delivery | delivery Operation、可恢复 CLI 状态 | 火山 VOD AIGC / 阿里 IMS | Bettr 118.333 秒 VOD 4K 已完成；IMS 仅契约实现 |
| 旁白、音乐与声音锁定 | 总 Skill | Voiceover/Music API、Cue Manifest、audio revision/lock | Qwen Audio 3.0 Plus + BigMusic + 本地侧链混音 | 29 Cue、119.86 秒音乐与 4K 双声道终版已完成 |
| 多轨预览/人工接管 | 无独立创作 Skill | EditorialWorkspaceAdapter + Runtime read model | OpenChatCut | Antom 真实项目已完成 9 段画面、旁白和音乐的 11 项时间线同步与版本回写 |

## 3. 仓库唯一源与链接

```text
skills/                         # 唯一可提交 Skill 源
  create-production-video/
    SKILL.md
    assets/production-run-record.template.json
    references/
  design-character-reference-pack/
  direct-aigc-motion-graphics/
  generate-minimax-h3-shot/
  review-video-candidate/
  libtv-cli/

.agents/skills/*                # 指向 skills/* 的本地符号链接，Git 忽略
.claude/skills/*                # 指向 skills/* 的本地符号链接，Git 忽略

src/domain/                     # Project、Plan、Operation、Asset、Review 契约
src/providers/                  # Seedance、Wan、Qwen Audio、VOD、IMS、ComfyUI、LibTV、OpenChatCut
scripts/                        # 通用、可恢复、可审计的生产 CLI
```

运行 `npm run skills:install -- --host=all` 后，Codex 与 Claude Code 读取同一份仓库 Skill；修改一处即可同步。不要修改链接目标目录里的副本。

## 4. 可替换 Agent Host

Codex 是当前主 Agent，但以下状态必须脱离聊天保存：

1. Production Plan 与镜头/段映射；
2. 有序参考角色、Prompt、Profile 和 Provider 任务；
3. 候选、确定性修复、评分和接受理由；
4. 图片锁定、4K、Cue、混音、QC、成本和哈希。

Claude Code 或其他 Host 只要读取仓库 Skill、结构化清单和 Runtime API，就可以继续任务。OpenChatCut 是可替换编辑工作区，不是 Agent Host 契约或持久化层。

## 5. 本次应更新的 Skill

| Skill | 本次更新 |
| --- | --- |
| `create-production-video` | 增加路线 A/B、长片分段、权威端点、EditorialTimeline、多轨人工审片、画面/声音分离锁版、一次性 4K、分 Cue 旁白和脱敏 Run Record |
| `direct-aigc-motion-graphics` | 增加 H3 与 direct-keyframes 的终稿级比较、长片边界和 endpoint-restore |
| `review-video-candidate` | 增加路线比较、原始/修复资产分离、分段边界、4K 与音频交付检查 |
| `generate-minimax-h3-shot` | 现有 REF2VA/FL2VA 方法仍有效；后续需把 Bettr 实测 Profile 的服务端版本/hash 登记到正式 Profile Registry |
| `design-character-reference-pack` | 本次无规则性缺口；后续真人/虚拟人物商业案例再补授权与模型拒绝证据 |
| `libtv-cli` | 保持官方 1.1.3 快照，不混入项目经验；线上 Schema 变化时单独升级 |

## 6. 仍需补齐的 Harness 能力

- 新 ProductionOperation API 当前负责账本和门禁，但没有自动调度所有 Provider；Bettr 的批处理事实仍部分存在于脚本清单。
- 已新增旁白 Take/母带、音乐、音效、字幕和编辑预览角色；仍需把现有 Bettr 文件正式登记到 Project 账本。
- 需要把 Qwen Audio 时间轴生成、VOD 本地 CLI 和 Seedance 分段批处理注册为项目级可恢复操作。
- 需要一个可替换的评测适配器；当前 Codex/人工评价必须显式回写，不能把 Provider 成功等同于质量通过。
- OpenChatCut 的真实素材映射、编辑会话、原子应用和同步版本回写已经在 Antom 本地 52 秒成片验证；下一步是补正式 `AssetImportAdapter`，减少手工导入成本。

完整服务成熟度见 [`SERVICE_CATALOG.md`](./SERVICE_CATALOG.md)，Bettr 方法与资产策略见 [`PRODUCTION_ASSETS.md`](./PRODUCTION_ASSETS.md)。
