import { useEffect, useMemo, useState } from "react";

type JobStatus =
  | "queued"
  | "planning"
  | "generating"
  | "evaluating"
  | "persisting"
  | "mastering"
  | "upscaling"
  | "composing"
  | "completed"
  | "failed"
  | "cancelled";

interface Candidate {
  id: string;
  provider: string;
  providerTaskId: string;
  status: "submitted" | "running" | "succeeded" | "failed";
  outputUrl?: string;
}

interface Shot {
  id: string;
  index: number;
  prompt: string;
  durationSeconds: number;
  status: "queued" | "generating" | "completed" | "failed";
  candidates: Candidate[];
  selectedCandidateId?: string;
}

interface JobEvent {
  at: string;
  status: JobStatus;
  message?: string;
}

interface VideoJob {
  id: string;
  status: JobStatus;
  updatedAt: string;
  shots: Shot[];
  events?: JobEvent[];
  request: { brief: string; durationSeconds: number };
  plan?: { title: string; creativeDirection: string };
  output?: {
    deliveryMode: "simulation" | "cloud";
    videoUrl?: string;
    masterVideoUrl?: string;
    width: 3840;
    height: 2160;
  };
  error?: { code: string; message: string; retryable: boolean };
  costEstimate?: {
    currency: "CNY";
    generationSeconds: number;
    upscaleSeconds: number;
    totalCny?: number;
  };
}

interface RuntimeInfo {
  videoProvider: "mock" | "bailian";
  videoModel: string;
  deliveryMode: "simulation" | "cloud";
  generationResolution: "1080P";
}

const statusLabels: Record<JobStatus, string> = {
  queued: "已排队",
  planning: "Agent 规划中",
  generating: "镜头生成中",
  evaluating: "候选评估中",
  persisting: "OSS 留存中",
  mastering: "母版合成中",
  upscaling: "4K 超分中",
  composing: "模拟合成中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const stageOrder: JobStatus[] = [
  "queued",
  "planning",
  "generating",
  "evaluating",
  "persisting",
  "mastering",
  "upscaling",
  "completed",
];

function authHeaders(apiKey: string): HeadersInit {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Request failed (${response.status})`);
  return body;
}

export function App() {
  const [brief, setBrief] = useState(
    "制作一支 15 秒横屏城市品牌片：清晨航拍钱塘江与现代天际线，镜头快速掠过街道与数字产业空间，最后定格在金色余晖中的城市轮廓。电影感、克制、高级，运镜连贯。",
  );
  const [durationSeconds, setDurationSeconds] = useState(15);
  const [audioUrl, setAudioUrl] = useState("");
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem("harness-api-key") ?? "");
  const [showConnection, setShowConnection] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [job, setJob] = useState<VideoJob>();
  const [runtime, setRuntime] = useState<RuntimeInfo>();
  const [selectedShotId, setSelectedShotId] = useState<string>();
  const [previewCandidateId, setPreviewCandidateId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const selectedShot = job?.shots.find((shot) => shot.id === selectedShotId) ?? job?.shots[0];
  const selectedCandidate = selectedShot?.candidates.find(
    (candidate) => candidate.id === previewCandidateId,
  ) ?? selectedShot?.candidates.find(
    (candidate) => candidate.id === selectedShot.selectedCandidateId,
  ) ?? selectedShot?.candidates.find(
    (candidate) => candidate.status === "succeeded" && candidate.outputUrl,
  );
  const previewUrl = job?.output?.videoUrl ?? selectedCandidate?.outputUrl;
  const isRealGeneration = runtime?.videoProvider === "bailian";
  const activeJobIsReal = !job || job.shots.every((shot) => shot.candidates.length === 0)
    ? isRealGeneration
    : job.shots.some((shot) => shot.candidates.some((candidate) => candidate.provider === "bailian-wan"));
  const isTerminal = job ? ["completed", "failed", "cancelled"].includes(job.status) : true;
  const progress = useMemo(() => {
    if (!job) return 0;
    if (job.status === "composing") return 82;
    if (job.status === "failed" || job.status === "cancelled") return 100;
    const index = stageOrder.indexOf(job.status);
    return index < 0 ? 0 : Math.round((index / (stageOrder.length - 1)) * 100);
  }, [job]);

  useEffect(() => {
    sessionStorage.setItem("harness-api-key", apiKey);
  }, [apiKey]);

  useEffect(() => {
    void fetch("/health/ready")
      .then((response) => parseResponse<{ status: string; runtime?: RuntimeInfo }>(response))
      .then((health) => setRuntime(health.runtime))
      .catch(() => setRuntime(undefined));
  }, []);

  useEffect(() => {
    const lastJobId = localStorage.getItem("harness-last-job");
    if (!lastJobId) return;
    void fetchJob(lastJobId).catch(() => localStorage.removeItem("harness-last-job"));
  }, []);

  useEffect(() => {
    if (!job || isTerminal) return;
    const timer = window.setTimeout(() => {
      void fetchJob(job.id).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "任务状态更新失败");
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [job, isTerminal]);

  async function fetchJob(id: string) {
    const response = await fetch(`/v1/video-jobs/${id}`, { headers: authHeaders(apiKey) });
    const next = await parseResponse<VideoJob>(response);
    setJob(next);
    if (!selectedShotId && next.shots[0]) setSelectedShotId(next.shots[0].id);
    return next;
  }

  async function createJob() {
    setSubmitting(true);
    setError(undefined);
    try {
      const references = audioUrl.trim()
        ? [{ type: "audio" as const, url: audioUrl.trim(), purpose: "driving_audio" }]
        : [];
      const response = await fetch("/v1/video-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
        body: JSON.stringify({
          brief,
          durationSeconds,
          aspectRatio: "16:9",
          outputResolution: "3840x2160",
          references,
          idempotencyKey: `studio-${crypto.randomUUID()}`,
        }),
      });
      const created = await parseResponse<VideoJob>(response);
      localStorage.setItem("harness-last-job", created.id);
      setSelectedShotId(undefined);
      setJob(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelJob() {
    if (!job) return;
    setError(undefined);
    try {
      const response = await fetch(`/v1/video-jobs/${job.id}/cancel`, {
        method: "POST",
        headers: authHeaders(apiKey),
      });
      setJob(await parseResponse<VideoJob>(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "取消失败");
    }
  }

  async function retryJob() {
    if (!job) return;
    setError(undefined);
    try {
      const response = await fetch(`/v1/video-jobs/${job.id}/retry`, {
        method: "POST",
        headers: authHeaders(apiKey),
      });
      setJob(await parseResponse<VideoJob>(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "重试失败");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">VAH</div>
        <div>
          <div className="project-name">城市品牌片 · 杭州未来感</div>
          <div className="project-meta">Video Agent Harness / production workspace</div>
        </div>
        <div className="top-actions">
          <button className="connection-badge" type="button" onClick={() => setShowConnection((value) => !value)}>
            <span className="online-dot" /> {isRealGeneration ? "百炼真实调用" : "Harness Local"}
          </button>
          <span className="delivery-badge">16:9 · 4K 交付</span>
          {job?.costEstimate?.totalCny !== undefined && <span className="cost">预计 ¥{job.costEstimate.totalCny.toFixed(2)}</span>}
          <button className="primary-action" type="button" onClick={() => void createJob()} disabled={submitting || brief.trim().length < 3}>
            {submitting ? "提交中…" : job && !isTerminal ? statusLabels[job.status] : "生成视频"}
          </button>
        </div>
        {showConnection && (
          <div className="connection-popover">
            <label htmlFor="api-key">Harness API Token</label>
            <input id="api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="本地未启用鉴权时留空" />
            <small>这里只接收 Harness 的客户端令牌，不要填写阿里云 AccessKey。</small>
          </div>
        )}
      </header>

      <div className="workspace-grid">
        <nav className="rail" aria-label="工作区导航">
          <button className="rail-item active" type="button"><strong>✦</strong><span>创作</span></button>
          <button className="rail-item" type="button"><strong>▣</strong><span>项目</span></button>
          <button className="rail-item" type="button"><strong>↻</strong><span>任务</span></button>
          <button className="rail-item" type="button"><strong>⌘</strong><span>模板</span></button>
        </nav>

        <aside className="control-panel">
          <div className="panel-heading"><h1>创作指令</h1><span>{runtime?.videoModel ?? "Wan 2.7"}</span></div>
          <div className="mode-tabs">
            <button className="active" type="button">文生视频</button>
            <button type="button" disabled title="待接入 wan2.7-i2v">首帧 / 首尾</button>
            <button type="button" disabled title="待接入 wan2.7-r2v">参考生视频</button>
          </div>

          <label className="field-label" htmlFor="brief">影片目标 <span>自然语言</span></label>
          <textarea id="brief" className="brief-input" value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={4000} />

          <label className="field-label" htmlFor="audio-url">驱动音频 <span>可选 · 公网或 OSS URL</span></label>
          <input id="audio-url" className="text-input" type="url" value={audioUrl} onChange={(event) => setAudioUrl(event.target.value)} placeholder="https://…/brand-theme.mp3" />

          <div className="two-columns">
            <div>
              <label className="field-label" htmlFor="duration">总时长</label>
              <select id="duration" value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))}>
                <option value={5}>5 秒</option><option value={10}>10 秒</option><option value={15}>15 秒</option><option value={30}>30 秒</option><option value={60}>60 秒</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="candidates">每镜头候选</label>
              <select id="candidates" value="server" disabled><option value="server">服务端控制</option></select>
            </div>
          </div>

          <button className="advanced-toggle" type="button" onClick={() => setShowAdvanced((value) => !value)} aria-expanded={showAdvanced}>
            {showAdvanced ? "收起高级参数" : "高级参数 · 生产配置"}
          </button>
          {showAdvanced && (
            <div className="advanced-grid">
              <div><span>生成模型</span><strong>{runtime?.videoModel ?? "wan2.7-t2v"}</strong></div>
              <div><span>生成规格</span><strong>{runtime?.generationResolution ?? "1080P"} · 16:9</strong></div>
              <div><span>交付规格</span><strong>3840 × 2160</strong></div>
              <div><span>Prompt 增强</span><strong>Provider 默认</strong></div>
            </div>
          )}

          <div className={`policy-note ${isRealGeneration ? "real" : ""}`}>
            {isRealGeneration
              ? `已连接阿里云百炼 ${runtime?.videoModel ?? "wan2.7-t2v"}：提交任务会按成功生成的视频秒数计费。当前 4K 交付仍为模拟，不会调用 IMS。`
              : "当前使用 Mock 与模拟交付，不产生云费用。"}
          </div>
          {error && <div className="error-banner" role="alert">{error}</div>}
        </aside>

        <main className="creative-stage">
          <div className="stage-tabs"><span>1 · 指令</span><span className="active">2 · 分镜</span><span>3 · 剪辑</span><span>4 · 交付</span></div>
          <section className="preview-area">
            <div className="preview-stack">
              <div className="video-frame">
                {previewUrl ? <video key={previewUrl} controls playsInline src={previewUrl} /> : (
                  <>
                    <div className="frame-toolbar"><span>{selectedShot ? `镜头 ${String(selectedShot.index + 1).padStart(2, "0")} · ${selectedShot.durationSeconds} 秒` : "16:9 预览"}</span><span>1920 × 1080</span></div>
                    <div className="frame-copy"><strong>{job?.plan?.title ?? "等待创建视频任务"}</strong><span>{selectedShot?.prompt ?? "提交创作指令后，Agent 会规划分镜并生成候选。"}</span></div>
                  </>
                )}
              </div>
              {selectedShot && selectedShot.candidates.filter((candidate) => candidate.outputUrl).length > 1 && (
                <div className="candidate-switcher" aria-label="视频候选">
                  {selectedShot.candidates.filter((candidate) => candidate.outputUrl).map((candidate, index) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={candidate.id === selectedCandidate?.id ? "active" : ""}
                      onClick={() => setPreviewCandidateId(candidate.id)}
                    >
                      候选 {index + 1}{candidate.id === selectedShot.selectedCandidateId ? " · 推荐" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="storyboard-section">
            <div className="section-heading"><strong>分镜候选</strong><span>{job ? `${job.shots.filter((shot) => shot.selectedCandidateId).length} / ${job.shots.length} 已选择` : "尚未生成"}</span></div>
            <div className="shot-grid">
              {job?.shots.length ? job.shots.map((shot) => (
                <button key={shot.id} type="button" className={`shot-card ${selectedShot?.id === shot.id ? "selected" : ""}`} onClick={() => { setSelectedShotId(shot.id); setPreviewCandidateId(undefined); }}>
                  <div className={`shot-visual shot-${shot.index % 3}`}><span>{shot.status === "completed" ? "✓" : "…"}</span></div>
                  <strong>{String(shot.index + 1).padStart(2, "0")} · {shot.prompt}</strong>
                  <small>{shot.durationSeconds} 秒 · {shot.candidates.length} 个候选 · {shot.status}</small>
                </button>
              )) : [0, 1, 2].map((index) => (
                <div className="shot-card placeholder" key={index}><div className={`shot-visual shot-${index}`} /><strong>等待分镜 {String(index + 1).padStart(2, "0")}</strong><small>Agent 尚未规划</small></div>
              ))}
            </div>
          </section>

          <section className="timeline-section">
            <div className="timeline-ruler"><span /><span>00:00</span><span>00:05</span><span>00:10</span><span>00:15</span></div>
            <div className="timeline-track"><label>视频</label><div className="track-lane">
              {(job?.shots.length ? job.shots : [{ id: "empty", durationSeconds: 15 }]).map((shot, index) => <span key={shot.id} style={{ flex: shot.durationSeconds }} className={`video-clip clip-${index % 3}`} />)}
            </div></div>
            <div className="timeline-track"><label>音频</label><div className="track-lane"><span className="audio-clip" /></div></div>
          </section>
        </main>

        <aside className="job-panel">
          <div className="panel-heading"><h2>任务与交付</h2><span>实时</span></div>
          <div className="job-summary">
            <div><strong>{job ? `job_${job.id.slice(0, 8)}` : "尚无任务"}</strong><span className={`status ${job?.status ?? "idle"}`}>{job ? statusLabels[job.status] : "待创建"}</span></div>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <small>{job ? `更新于 ${new Date(job.updatedAt).toLocaleTimeString("zh-CN")}` : isRealGeneration ? "百炼真实生成 · 成功任务按量计费" : "Mock 模式可立即验证完整状态机"}</small>
          </div>

          <div className="section-heading"><strong>执行流水线</strong><span>{progress}%</span></div>
          <div className="pipeline">
            {[
              ["Agent 分镜规划", "planning"], ["Wan 候选生成", "generating"], ["评估与持久化", "persisting"], ["1080P 母版", "mastering"], ["4K 交付", "upscaling"],
            ].map(([label, status], index) => {
              const stageIndex = stageOrder.indexOf(status as JobStatus);
              const currentIndex = job?.status === "composing" ? stageOrder.indexOf("mastering") : stageOrder.indexOf(job?.status ?? "queued");
              const done = job?.status === "completed" || currentIndex > stageIndex;
              const current = currentIndex === stageIndex;
              return <div className={`pipeline-step ${done ? "done" : ""} ${current ? "current" : ""}`} key={status}><i>{done ? "✓" : index + 1}</i><div><strong>{label}</strong><small>{done ? "已完成" : current ? statusLabels[job?.status ?? "queued"] : "等待"}</small></div></div>;
            })}
          </div>

          {job?.error && <div className="job-error"><strong>{job.error.code}</strong><span>{job.error.message}</span></div>}
          <div className="job-actions">
            {job && !isTerminal && <button type="button" onClick={() => void cancelJob()}>取消任务</button>}
            {job?.status === "failed" && job.error?.retryable && <button type="button" onClick={() => void retryJob()}>从检查点重试</button>}
          </div>

          <div className="section-heading events-heading"><strong>事件</strong><span>结构化日志</span></div>
          <div className="event-list">
            {job?.events?.slice().reverse().slice(0, 7).map((event, index) => (
              <div className="event-row" key={`${event.at}-${index}`}><time>{new Date(event.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span>{event.message ?? statusLabels[event.status]}</span></div>
            )) ?? <div className="event-empty">创建任务后，这里显示可追溯事件。</div>}
          </div>

          <div className="delivery-note">{job?.output
            ? `${activeJobIsReal ? "真实 Wan 素材已生成" : "模拟生成完成"} · ${job.output.deliveryMode === "cloud" ? "云端 4K 已交付" : "4K 交付待接入"}`
            : "目标交付：真实 Wan 素材、4K MP4、1080P 母版、分镜参数与任务事件。"}</div>
        </aside>
      </div>
    </div>
  );
}
