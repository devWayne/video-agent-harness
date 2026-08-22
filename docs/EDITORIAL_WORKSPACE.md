# Harness 时间线与 OpenChatCut 工作区边界

> 重构日期：2026-08-22

## 结论

Harness 不再内置项目管理前端。它是无头的 TypeScript/Node.js 控制层和生产账本；OpenChatCut 是首个可替换的多轨编辑工作区。两者通过 Streamable HTTP MCP 和稳定资产映射协作。

上游项目：<https://github.com/0xsline/OpenChatCut>，当前核对版本 `0.2.9`，许可证 `AGPL-3.0-or-later`。本仓库只实现协议适配，不复制上游前端源码。

```text
Codex / compatible Agent Host
  → repo-local Skills：创意、分镜、路由、评审和重做决定
  → Harness Runtime：Project / Asset / Operation / Review / EditorialTimeline
  ↔ OpenChatCut：多轨预览、局部替换、旁白/音乐/SFX、标记与人工精修
  → Harness 锁版与交付：picture lock → 4K → audio lock → QC / Archive
```

原则是：**决策在 Agent，事实在 Runtime，编辑界面可替换。**

## Runtime 保存什么

- 项目 Brief、人物包、场景包、Story → Scene → Shot 计划；
- Provider 操作、任务 ID、输入输出资产、评审和成本；
- 多轨时间线：画面、品牌叠加、字幕、原声、旁白、音乐和音效；
- 每个片段的当前 Asset、所有候选版本、时间线帧位、源入点和时长；
- 帧级审片标记；
- 画面和声音的独立 revision、锁版人、时间和备注；
- 外部工作区 Project ID、编辑 URL、Edit Session ID 和最后同步版本。

局部替换支持两种模式：

- `preserve-slot`：新素材保留原时间槽，不移动后续片段；适合替换某一个 AI 镜头版本。
- `ripple`：片段时长改变，后续片段和标记统一移动；画面与声音 revision 都会更新。

历史锁版记录不会被删除。只要 revision 已变化，旧锁就被判定为 stale，从而避免“修改后仍显示已锁定”。

## OpenChatCut 做什么

- 把 10 个或更多 AI 片段串在一条可播放时间线上；
- 比较候选并进行局部替换；
- 管理旁白、背景音乐、音效和字幕；
- 添加帧级人工审片标记；
- 在 `manual` 模式中先展示 staged proposal，批准后才落到编辑项目；
- 在 `auto` 模式中也通过 `review_edit_session` 原子提交，不允许半完成修改污染项目。

OpenChatCut 不负责人物 Bible、故事和模型路由，也不拥有最终接受权。它是外部 AGPL 应用，应单独部署；本仓库不复制或内嵌其前端源码。

## 第一版接入约束

默认地址：

```dotenv
EDITORIAL_WORKSPACE_PROVIDER=openchatcut
OPENCHATCUT_MCP_URL=http://127.0.0.1:5199/api/external-mcp/mcp
OPENCHATCUT_EDITOR_URL=http://127.0.0.1:5199
OPENCHATCUT_APPROVAL_MODE=manual
```

第一版 `workspace-sync` 不读取任意本地路径，也不伪造上传协议。素材要先进入 OpenChatCut Media Pool，调用时显式传：

```json
{
  "approvalMode": "manual",
  "assetBindings": {
    "harness-asset-uuid": "openchatcut-pool-asset-id"
  }
}
```

这让资产导入和时间线编辑成为两个可审计步骤。后续可以补 `AssetImportAdapter`，但不得把临时 URL 或浏览器私有状态变成唯一资产来源。

当 OpenChatCut 编辑器已经打开目标工程时，MCP 服务会在 `openchatcut_status.connectedProjectIds` 中暴露该工程。Adapter 此时不再调用离线 `target_project` 抢占工程所有权，而把 `editorProjectId` 传给 `begin_edit_session`，通过浏览器桥接在当前工程内原子提交。编辑器没有连接时，仍使用原来的 server-direct target 路径。两条路径均保留显式素材映射和 edit session 审计。

2026-08-22 已完成 Antom 真实纵向联调：9 段画面、1 段本地预览旁白和 1 段本地音乐进入同一 52 秒时间线，Harness 回写 OpenChatCut Project ID、Edit Session ID、同步版本和 `applied` 状态，并分别锁定 picture/audio revision。

## 与其他工作台的关系

| 系统 | 解决的问题 | 是否保存 Harness 最终事实 |
| --- | --- | --- |
| ComfyUI / MiniMax H3 | 节点级生成、动作与镜头骨架控制 | 否；输出回写为 Asset/Operation |
| LibTV | 创意画布、模型聚合和可选在线生成 | 否；接受的结果回写为 Asset/Operation |
| OpenChatCut | 线性多轨剪辑、串片预览、局部替换和人工精修 | 否；同步结果、锁版和交付事实回写 Runtime |
| HyperFrames / FFmpeg | 确定性文字包装、混音、编码和 QC | 否；输出回写为母版/交付 Asset |

OpenChatCut 与 LibTV 不合并：前者是线性编辑工作区，后者偏创意画布与生成；是否调用由 Agent 根据阶段选择。
