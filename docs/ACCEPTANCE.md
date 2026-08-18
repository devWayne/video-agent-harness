# 验收记录

更新时间：2026-08-17

## 已验证

| 范围 | 证据 | 结果 |
| --- | --- | --- |
| 工程质量门禁 | `npm run check` | TypeScript、ESLint、Vitest、生产构建通过；12 个测试文件、38 项测试通过 |
| Shot Recipe 契约 | `direct` 与 `comfyui-libtv` 单元测试 | 控制资产从 ComfyUI 步骤传入 LibTV 步骤；步骤状态、Task ID、最终视频和结构化评价可持久化 |
| ComfyUI Workflow 编译 | Harness Token 测试 | Prompt、帧数、宽度与 Seed 能以正确 JSON 类型注入 API-format Workflow |
| LibTV CLI 映射 | Fake Canvas Client 契约测试 | 控制视频通过 `upload` 成为资源节点，随后创建 `video2video`、16:9、1080P Wan 2.7 节点；测试不产生上传或模型费用 |
| 项目级 Studio | Project HTTP/API + SQLite 集成测试 | Project、三类参考资产、Character Pack、Scene Pack、Story Scene 与关联 VideoJob 完整持久化；跨项目 Asset/Pack 引用被拒绝 |
| HyperFrames 动效切片 | Studio → Composition API → Core lint → 官方 Player | 1920×1080 标题卡与 24 秒《智慧城市的一天》6 场景模板均通过 0 warning lint；浏览器实测开场、交通、智造、城市安全场景播放和 seek 正常 |
| Wan 2.7 最小协议 | `wan2.7-t2v`，2 秒，720P，16:9 | 阿里云异步任务成功，任务 ID `50e3dbbb-80aa-49ad-ac21-6baf0aca23ef` |
| Wan 2.7 生产请求 | `wan2.7-t2v`，2 秒，1080P，16:9，模型自动音频 | 阿里云异步任务成功，任务 ID `17adbb94-389c-4df6-bf1b-84ec3799e866` |
| 本地纵向闭环 | Fastify API → 工作流 → Mock → 清单 | 创建任务后完成 3840×2160 模拟交付，健康检查、指标和事件均正常 |
| OSS 基础设施 | 北京地域专用私有 Bucket（名称仅本地配置） | 私有、阻止公共访问、同城冗余、OSS 托管 AES-256 加密 |
| 请求契约 | Wan T2V、OSS 持久化、IMS 母版、IMS SR5 | 单元和集成测试覆盖提交、轮询、恢复、跨地域拦截、私有下载签名 |
| 付费前保护 | 云身份与 OSS/IMS 只读权限预检 | 自动测试覆盖；本机运行任务 `9add4247-c021-4832-8572-23417918f841` 在 `queued` 阶段以 `ALIYUN_CLOUD_PREFLIGHT_FAILED` 结束，镜头数为 0，证明未提交 Wan 候选 |
| 签名脱敏 | Provider 临时 URL → OSS 后 | 已持久化候选与生产清单移除账号、查询签名和 fragment；自动测试覆盖 |
| GitHub 远端 | 私有 `devWayne/video-agent-harness` | `main` 已创建并推送；本次 HyperFrames 切片继续沿用同一仓库 |

真实烟测脚本只记录任务 ID、规格与结果主机，不输出 API Key 或完整签名 URL。

## 待账号侧验收

| 范围 | 当前条件 | 验收动作 |
| --- | --- | --- |
| OSS 真实转存 | 需要本地 RAM/STS 运行身份 | 把 Wan 临时产物流式写入私有 Bucket，并核对对象元数据 |
| IMS 1080P 母版 | 需要同一运行身份及 IMS 权限 | 提交时间线，轮询成功并验证私有母版对象 |
| IMS SR5 4K | 依赖真实 1080P 母版 | 用系统模板 `S00000004-401070` 输出 3840×2160 成片 |
| 私有下载 | 依赖真实 4K 对象 | 由 API 签发短时 URL，确认匿名访问失败、签名访问成功 |
| 本地 ComfyUI 控制视频 | 需要导出可运行的 H3 API Workflow JSON | 使用 5 秒、720P、单候选运行 control-pass，核对动作/镜头骨架与本地持久化资产 |
| LibTV V2V 纵向闭环 | 需要画布 UUID 和有效 CLI 登录 | 上传上一项控制视频，以 Wan 2.7 `video2video` 生成最终镜头并核对 Recipe/Manifest；该步骤产生公网流量和模型费用 |
| 真实质量评价 | 需要选择 VLM 与阈值 | 替换首成功基线，验证 `revise-control` 和 `regenerate-final` 的局部回跳 |

代码默认保持 `DELIVERY_MODE=simulation`，直到真实 RAM/STS 凭据齐备；这样不会把“配置了一半”误当成已验收的付费生产链路。

账号身份配置完成后，`npm run smoke:cloud` 会执行上述四项账号侧验收，并把不含密钥和签名 URL 的结果写入 `.data/cloud-smoke/cloud-acceptance.json`。
