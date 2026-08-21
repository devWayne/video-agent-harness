# Production Console 与专业工作台边界

> 架构重构日期：2026-08-20

## 结论

3321 上的 UI 不是 Harness Agent，也不是创作入口的第二个大脑。它是已经降级的兼容 `Production Console`：API 与数据契约继续保留，但不再把这套 React UI 作为主要创作终端。Nomi 或未来其他开源工作区可以替换展示/操作层，前提是项目事实仍回写 Runtime。

```text
Codex GPT + repo Skills       决策与评审
          ↓ typed commands
TypeScript Runtime            执行、校验、恢复与记账
          ↓ read model
Nomi / compatible Console     可视化、创意工作区与人工接管
          ↘ external links
ComfyUI / LibTV workbenches   专业参数与画布编辑
```

因此采用：**决策在 Agent，事实在 Runtime，界面可替换，专业编辑仍在专业工作台。**

## Console 展示什么

- 项目 Brief、人物包、场景包和参考素材；
- Codex 写入的 Story → Scene → Shot Production Plan；
- 每镜头控制草稿、在线终稿、评审和重试操作；
- 操作依赖、执行器、Profile、Provider Task ID 和失败原因；
- 输入、控制、候选、已接受镜头、母版和交付资产；
- Codex 或人工评审的阶段、分数、问题和决定；
- ComfyUI Profile 与 LibTV Canvas 的定位入口；
- 成本、QC、Manifest 和归档状态。

Console 可以提供人工 `accept / reject / human-review`、取消、重跑授权和配置入口，但这些动作必须调用 Runtime API 并进入账本，不能只改浏览器状态。

## Console 不展示成什么

- 不复制 ComfyUI 的节点图、KSampler、VAE、LoRA 和 ControlNet 编辑器；
- 不复制 LibTV 的无限画布；
- 不在浏览器里运行一个隐藏的 LLM Director；
- 不把“Provider 成功”自动标成“质量通过”；
- 不让用户从一个大 Prompt 直接触发整片并绕过结构化分镜；
- 不保存 API Key、账号、内网端口、模型本地路径和 Cookie 到项目数据或 Git。

## 与 ComfyUI 的关系

ComfyUI 有两种使用面：

1. Workbench：开发期由人或 Agent 调节点、验证 H3 Workflow 和 Profile；
2. Provider：生产期由 Runtime 执行已批准 Profile 并回收控制资产。

Console 只保存非敏感的 Profile ID、任务 ID、资产 ID、状态和可选跳转 URL。控制视频必须以 `control-asset` 角色回写项目，而不是只留在 ComfyUI 的输出目录。

## 与 LibTV 的关系

LibTV 无限画布适合空间化探索和人工创意组装；Console 适合项目级状态、门禁和审计。两者不合并：

| 维度 | Production Console | LibTV Canvas |
| --- | --- | --- |
| 核心问题 | 整支作品的计划、操作、版本与交付是否可追溯 | 素材和生成节点怎样在画布里探索和组合 |
| 数据结构 | Project / Plan / Operation / Asset / Review / Delivery | Canvas / Node / Edge / Resource |
| 决策权 | 显示 Codex/人工已记录决定 | 可产生候选，但不是最终事实来源 |
| 生命周期 | 稳定、可恢复、可审计 | 灵活、临时、可探索 |

接受的 LibTV 节点产物要作为项目 Asset 回写 Runtime；Canvas UUID 和 Node/Task ID 只作为血缘定位。

## 当前 UI 状态与迁移

3321 兼容 UI 已完成第一版：

- 首页明确显示 Codex、Runtime、Console 三层；
- 流程页按 Production Plan 和 ProductionOperation 展示；
- 控制草稿与终稿评审拆成两个门禁；
- 旧自动 VideoJob 移入 `Legacy Autopilot` 区；
- 项目页显示 Agent Plan、Runtime 操作账本和五类资产通道；
- 交付页优先读取 Delivery Operation，而不是旧 Job 状态。

不再继续为 3321 UI 补齐上述产品能力。下一步先定义 Nomi 与 Runtime 的同步适配：Project/Plan/Operation/Asset/Review 的导入、回写、冲突处理和深链跳转。完成适配前，Nomi 本地状态不是生产事实来源，且 `.nomi/` 必须保持 Git 忽略。
