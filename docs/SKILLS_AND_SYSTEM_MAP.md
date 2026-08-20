# Skills 与工程映射

> Agent-directed 重构基线：2026-08-20

## 1. Skill 层级

```text
Codex GPT（当前主 Agent Host）
└── create-production-video（总创作 Skill）
    ├── 人物、场景、故事和分镜设计
    ├── 连续性与成本策略
    ├── 路由 control / final / assembly / delivery
    ├── generate-minimax-h3-shot（H3 单镜头控制 Skill）
    ├── review-video-candidate（分阶段看片与诊断 Skill）
    ├── libtv-cli（官方 LibTV 操作 Skill）
    └── Runtime OpenAPI（计划、操作、资产、评审与交付账本）
```

总 Skill 是流程大脑；子 Skill 是专业方法。Runtime 不是这一层里的另一个 Agent。

## 2. 端到端映射

| 生产问题 | 决策 / 知识层 | 工程契约 | 执行面 | 产物 |
| --- | --- | --- | --- | --- |
| Brief、人物、故事、分镜 | Codex + `create-production-video` | `StoryProductionPlan` | 无 | 结构化计划 |
| H3 场景路由与参数 | `generate-minimax-h3-shot` | `control-generation` Operation + Profile | ComfyUI / MiniMax H3 | `control-asset` / motion reference |
| 草稿是否可用 | Codex + `review-video-candidate` relaxed policy | Operation Review `control-draft` | Codex 视觉理解 / 人工 | accept / revise-control |
| 生产级终稿模型选择 | Codex 总 Skill | `final-render` Operation | Seedance / MiniMax cloud / LibTV-selected model | `final-candidate` |
| 终稿是否达标 | Codex + `review-video-candidate` strict policy | Operation Review `final-candidate` | Codex 视觉理解 / 人工 | accept / revise-control / regenerate-final |
| 合格镜头清单 | Codex 决策 | accepted operations + Project Assets | Runtime | Accepted shots |
| 剪辑、文字与确定性包装 | 总 Skill 的 assembly 路由 | `assembly` Operation | HyperFrames / optional LibTV assembly | `assembly-master` |
| 4K、QC 与归档 | 总 Skill 的 delivery 路由 | `delivery` Operation | IMS / storage / QC | `delivery-master` + Manifest |
| 状态与人工介入 | 无创作 Skill | Project read model | Production Console | 可视化投影 |

## 3. 仓库目录

```text
.agents/skills/create-production-video/
  SKILL.md
  references/
    production-state-machine.md
    contracts.md
    agent-runtime-boundary.md
    approval-policy.md

skills/generate-minimax-h3-shot/
  SKILL.md
  profiles/                  # H3 批准/开发期 Workflow Profiles

skills/review-video-candidate/
  SKILL.md
  references/scoring-rubric.md

skills/libtv-cli/            # 官方 CLI Skill 快照

src/domain/
  story-production.ts        # Codex 写入的故事/场景/镜头契约
  production-operation.ts    # 执行与评审双状态契约
  production-project.ts      # 项目、资产、计划和操作聚合

src/application/
  production-project-service.ts

src/providers/               # 外部执行面适配器
web/                         # Production Console，只读投影 + 人工命令
```

## 4. 可替换 Agent Host

Codex 是当前主 Agent，但生产状态不存于 Codex 私有记忆。另一个 Host 要接管，只需：

1. 能读取仓库 Skill；
2. 能调用 Runtime OpenAPI/MCP/CLI；
3. 读取 Project、Production Plan、Operations、Assets 和 Reviews；
4. 遵守同一评审与审批策略。

因此 Claude Code 或未来其他工具可以恢复任务，而不需要复刻 Codex 的聊天记录。

## 5. 旧模块的降级关系

以下模块仍存在，但仅服务旧 `/v1/video-jobs`：

- `PiDirector` / `DeterministicDirector`；
- `WorkflowEngine`；
- 自动执行整张 `ShotRecipe` 的 Candidate Pipeline；
- `FirstSuccessfulCandidateEvaluator`。

新主流程不会调用它们来替 Codex 创作或自动接受镜头。待所有现有 Provider 都接入 ProductionOperation Executor 后再删除兼容层。

## 6. 当前缺口

- 现有 ComfyUI、LibTV、HyperFrames、IMS Provider 尚需注册为新的 Operation Executor；
- Seedance 2.5 和 MiniMax 云端终稿 Provider 尚未实现；
- ComfyUI 生产 Executor 尚需补齐参考图片上传和 H3 动态参考槽绑定；
- Codex 评审目前通过 Skill/人工回写，尚未封装成可独立部署的视觉评分服务；
- Console 尚需增加候选对比、证据帧、成本时间线和操作按钮。

这些缺口不会改变层级：决策仍在主 Agent，执行和事实仍在 Runtime，UI 仍只是投影。
