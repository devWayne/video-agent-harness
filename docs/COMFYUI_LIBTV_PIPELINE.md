# ComfyUI → LibTV Controlled Generation Pipeline

## 目标

这是一条可选高控制配方，用于对动作、镜头轨迹、构图和节奏有明确要求、且代表镜头 A/B 已证明控制视频确实改善终稿的商业镜头：先用本地 ComfyUI/H3 生成控制视频，再把它作为 LibTV 在线模型的 Reference Video。

它不是默认主流程，也不能仅因为 H3 草稿可用就批量启用。两个阶段具有不同目标：

| 阶段 | 优化目标 | 主要控制 |
| --- | --- | --- |
| ComfyUI control-pass | 镜头骨架正确 | H3、LoRA、ControlNet、Sampler、VAE、Seed、首尾帧、姿态/深度等 |
| LibTV final-generation | 商业观感和线上模型质量 | Reference Video、Prompt、模型、分辨率、时长、声音等 Schema 参数 |

## 前置条件

- Node.js 22+；
- Harness 已安装依赖；
- ComfyUI 能从 Harness 所在机器访问；实际主机和端口只写入被忽略的 `.env.local`；
- ComfyUI 已安装并加载本地 H3 Workflow 需要的节点和模型；
- LibTV CLI 1.1.3 或兼容版本已安装并登录；
- 已有 LibTV 画布 UUID；
- 账号可使用所选线上视频模型。

在这些条件之前，先用同一个代表镜头比较：

1. 原始权威关键帧直接进入最终模型；
2. H3 控制视频 + 原始外观/品牌参考进入最终模型。

只有第二条在终稿端的动作、端点、时序、品牌完整性和成本上更优，才把这条配方扩展到更多镜头。Bettr 2026-08-22 实证选择了第一条，因此没有把 H3 草稿上传到最终 Seedance 长片任务。

运行代码与单元测试不会自动产生在线调用。只有启用配方并创建视频任务才会上传素材、调用模型和产生费用。

## 第一步：准备 ComfyUI API Workflow

在 ComfyUI 网页端完成并验证 Workflow，然后导出 API 格式 JSON。Harness 不接受 UI Workflow，也不猜测节点 ID。

把固定值替换成 Harness Token，例如：

```json
{
  "positive_prompt_node": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "{{HARNESS_PROMPT}}"
    }
  },
  "video_node": {
    "class_type": "YourH3VideoNode",
    "inputs": {
      "width": "{{HARNESS_WIDTH}}",
      "height": "{{HARNESS_HEIGHT}}",
      "num_frames": "{{HARNESS_FRAME_COUNT}}",
      "fps": "{{HARNESS_FPS}}",
      "seed": "{{HARNESS_SEED}}"
    }
  }
}
```

Token 列表：

| Token | 默认行为 |
| --- | --- |
| `HARNESS_PROMPT` | 使用当前分镜 Prompt |
| `HARNESS_DURATION_SECONDS` | 当前镜头秒数 |
| `HARNESS_FRAME_COUNT` | 秒数 × 24 + 1 |
| `HARNESS_FPS` | 24 |
| `HARNESS_WIDTH` / `HARNESS_HEIGHT` | 1280 / 720 |
| `HARNESS_SEED` | 从 Candidate ID 稳定派生 |
| `HARNESS_CLIENT_REQUEST_ID` | `<jobId>/<candidateId>` |

保留 ComfyUI 输出视频节点。Harness 会从 History 的 `videos`、`gifs` 或 `images` 输出中优先寻找 MP4/MOV/WebM/MKV 文件。

## 第二步：配置运行环境

```dotenv
GENERATION_PIPELINE=comfyui-libtv

COMFYUI_BASE_URL=http://comfyui-host.internal
COMFYUI_STUDIO_URL=http://comfyui-host.internal
COMFYUI_WORKFLOW_PATH=/absolute/path/to/h3-control-api.json
COMFYUI_POLL_INTERVAL_MS=2000
COMFYUI_TIMEOUT_MS=1800000

LIBTV_CLI_PATH=libtv
LIBTV_PROJECT_UUID=<canvas UUID>
LIBTV_STUDIO_URL=<canvas URL>
LIBTV_MODEL_NAME=Wan 2.7
LIBTV_MODE_TYPE=video2video
LIBTV_MAX_DURATION_SECONDS=10

SHOT_CANDIDATES=1
```

Wan 2.7 的当前 LibTV Schema 对 `video2video` 接受一条参考视频，输出支持 720P/1080P，单镜头 2–10 秒。CLI 会在运行时重新按线上 Schema 校验参数；Schema 更新后应先重新审计再修改 Profile。

如果 shell 找不到 `libtv`，把 `LIBTV_CLI_PATH` 设置为真实可执行文件绝对路径。不要把 LibTV 凭据文件或任何云端 Key 加入仓库。

## 第三步：运行前只读检查

以下操作不会生成视频，但 LibTV 命令会访问网络并产生少量协议流量：

```bash
curl "$COMFYUI_BASE_URL/system_stats"
libtv account info
libtv model wanx2.7-video
libtv node list --project "$LIBTV_PROJECT_UUID"
```

确认：

- ComfyUI 返回设备和版本信息；
- LibTV 登录账号正确；
- `Wan 2.7` Schema 仍支持 `video2video`；
- 目标画布可读写。

Harness 在真实任务开始时也会自动执行等价的只读预检：读取并解析 Workflow、查询 ComfyUI `system_stats`、读取 LibTV 画布节点和所选模型 Schema。预检失败时不会提交 ComfyUI Workflow、上传控制视频或启动付费 LibTV 模型。

## 第四步：最小真实任务

启动 Harness：

```bash
npm run dev
```

提交一个 5 秒、一个候选的任务：

```bash
curl --request POST http://127.0.0.1:3321/v1/video-jobs \
  --header 'content-type: application/json' \
  --data '{
    "brief": "人物向前奔跑，镜头快速跟随并环绕，商业电影质感",
    "durationSeconds": 5,
    "idempotencyKey": "controlled-smoke-001"
  }'
```

任务响应和最终 Manifest 中应看到：

```text
recipe.profile = comfyui-libtv
executions[control-pass].executor = comfyui-control
executions[control-pass].assets[0].role = motion-reference
executions[final-generation].executor = libtv-generation
assets[final-video]
evaluation.decision = accept
```

## 官方 CLI 映射

Harness 不自行构造 LibTV HTTP 请求。逻辑等价于：

```bash
libtv upload "Harness <candidate> motion reference" \
  --file <local-control.mp4> \
  --type video \
  --project <canvas-uuid>

libtv node create "Harness <candidate> final video" \
  --type video \
  --project <canvas-uuid> \
  --left "Harness <candidate> motion reference" \
  --prompt "...引用控制视频并保持动作、轨迹、构图和节奏..." \
  --set "model=Wan 2.7" \
  --set modeType=video2video \
  --set ratio=16:9 \
  --set resolution=1080P \
  --set duration=5 \
  --set enableSound=on \
  --run
```

`--run` 会阻塞到 LibTV 任务终态，外层不额外轮询。

## 检查点与恢复

| 失败位置 | 持久化信息 | 恢复行为 |
| --- | --- | --- |
| ComfyUI 提交后 | `prompt_id` | 查询 History，不重复提交 |
| 控制视频下载后 | 本地路径与 `motion-reference` | 跳过已成功 control-pass |
| LibTV 上传后 | 稳定资源节点名 | 查询画布，存在则复用 |
| LibTV 节点创建后 | 稳定输出节点名 | 有 URL 直接复用；无 URL 重新 `--run` |
| 最终视频通过后 | `final-video` 与评价 | 进入交付，不重复生成 |

## 流量与费用说明

- ComfyUI 输出下载通常走局域网；
- 从 Mac 上传控制视频到 LibTV 是公网流量；
- LibTV V2V 是付费模型调用；
- 每个候选都会产生一次独立控制与在线生成链路；
- 开启 Cloud Delivery 后还会把最终视频转存 OSS，并可产生 IMS 费用。

受限流量环境的首次验收建议：5 秒、720P 控制视频、`SHOT_CANDIDATES=1`，确认链路和质量后再提高候选数。

## 当前边界

- 结构化质量报告已实现，但默认评价器仍是首个成功候选基线；
- `revise-control` 与 `regenerate-final` 的自动局部回跳尚未接入 VLM；
- LibTV Script 和 Assembly 适配器已经存在，但未默认加入视频任务；
- 本地 H3 FL2VA/REF2VA 已通过项目工具真实生成，但通用 `comfyui-libtv` Runtime Profile 仍未绑定这份服务端 Workflow/Hash；
- LibTV 真实 V2V 纵向闭环尚未验收，当前只有 CLI/Schema 和假客户端契约测试；
- HyperFrames 与 IMS 属于生成后的后期和交付，不属于该两步生成配方。
