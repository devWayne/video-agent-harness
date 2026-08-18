import { useCallback, useEffect, useMemo, useState } from "react";
import { HyperframesPreview } from "./HyperframesPreview";

type ViewId = "overview" | "pipeline" | "assets" | "post-production" | "delivery";
type StageState = "waiting" | "ready" | "running" | "passed" | "attention" | "disabled";
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

interface RuntimeInfo {
  videoProvider: "mock" | "bailian";
  videoModel: string;
  generationPipeline?: "direct" | "comfyui-libtv";
  deliveryMode: "simulation" | "cloud";
  generationResolution: "1080P";
}

interface ControlSurface {
  id: "comfyui" | "libtv" | "hyperframes" | "delivery";
  name: string;
  role: string;
  status: "ready" | "configured" | "not-configured" | "disabled";
  kind: "external" | "embedded";
  url?: string;
}

interface WorkspaceInfo {
  name: string;
  controlSurfaces: ControlSurface[];
}

type ProjectAssetMediaType = "image" | "video" | "audio" | "document" | "workflow";
type ProjectAssetRole =
  | "identity-reference"
  | "appearance-reference"
  | "action-reference"
  | "camera-reference"
  | "scene-reference"
  | "style-reference"
  | "voice-reference"
  | "music"
  | "control-asset"
  | "final-candidate"
  | "delivery-master"
  | "other";

interface ProjectAsset {
  id: string;
  version: number;
  name: string;
  mediaType: ProjectAssetMediaType;
  role: ProjectAssetRole;
  uri: string;
  source: "user" | "comfyui" | "libtv" | "hyperframes" | "delivery";
  tags: string[];
}

interface CharacterPack {
  id: string;
  name: string;
  referenceAssetIds: string[];
  consistencyNotes?: string;
}

interface ScenePack {
  id: string;
  name: string;
  referenceAssetIds: string[];
  location: string;
  lighting: string;
  continuityNotes?: string;
}

interface StoryScene {
  id: string;
  index: number;
  title: string;
  summary: string;
  durationSeconds: number;
  characterPackIds: string[];
  scenePackId?: string;
  shotBriefs: string[];
  videoJobIds: string[];
}

interface ProductionProject {
  id: string;
  name: string;
  brief: string;
  storySynopsis: string;
  status: "active" | "archived";
  updatedAt: string;
  deliverySpec: { aspectRatio: "16:9"; width: 3840; height: 2160; fps: number };
  workbenchBindings: {
    comfyuiProfileId?: string;
    comfyuiUrl?: string;
    libtvCanvasUuid?: string;
    libtvCanvasUrl?: string;
  };
  assets: ProjectAsset[];
  characterPacks: CharacterPack[];
  scenePacks: ScenePack[];
  scenes: StoryScene[];
  videoJobIds: string[];
}

interface ProjectDetail {
  project: ProductionProject;
  jobs: VideoJob[];
}

interface GenerationAsset {
  id: string;
  role: string;
  mediaType: "image" | "video" | "audio";
  uri: string;
  localPath?: string;
  sourceExecutor: string;
}

interface EvaluationReport {
  evaluator: string;
  overallScore: number;
  decision: "accept" | "revise-control" | "regenerate-final" | "human-review";
  dimensions?: Record<string, number>;
  issues?: Array<{ code: string; message: string; severity: string }>;
}

interface Candidate {
  id: string;
  provider: string;
  providerTaskId: string;
  status: "submitted" | "running" | "succeeded" | "failed";
  outputUrl?: string;
  recipe?: { profile: "direct" | "comfyui-libtv" };
  executions?: Array<{
    stepId: string;
    executor: "video-provider" | "comfyui-control" | "libtv-generation";
    status: "queued" | "running" | "succeeded" | "failed";
    taskId?: string;
    error?: string;
    assets?: GenerationAsset[];
  }>;
  assets?: GenerationAsset[];
  evaluation?: EvaluationReport;
}

interface Shot {
  id: string;
  index: number;
  prompt: string;
  durationSeconds: number;
  status: "queued" | "generating" | "evaluating" | "completed" | "failed";
  candidates: Candidate[];
  selectedCandidateId?: string;
}

interface VideoJob {
  id: string;
  status: JobStatus;
  updatedAt: string;
  shots: Shot[];
  events?: Array<{ at: string; status: JobStatus; message?: string }>;
  request: {
    brief: string;
    durationSeconds: number;
    references?: Array<{ type: "image" | "video" | "audio"; url: string; purpose?: string }>;
  };
  plan?: { title: string; creativeDirection: string };
  output?: {
    manifestUrl: string;
    deliveryMode: "simulation" | "cloud";
    videoUrl?: string;
    masterVideoUrl?: string;
    width: 3840;
    height: 2160;
  };
  error?: { code: string; message: string; retryable: boolean };
  costEstimate?: { currency: "CNY"; generationSeconds: number; upscaleSeconds: number; totalCny?: number };
}

interface CompositionPreview {
  id: string;
  previewUrl: string;
  durationSeconds: number;
  lint: { warningCount: number; findings: Array<{ code: string; message: string }> };
}

interface PipelineStage {
  id: string;
  index: string;
  owner: string;
  title: string;
  description: string;
  state: StageState;
  surfaceId?: ControlSurface["id"];
  view?: ViewId;
}

const navigation: Array<{ id: ViewId; glyph: string; label: string }> = [
  { id: "overview", glyph: "⌂", label: "总览" },
  { id: "pipeline", glyph: "⌘", label: "流程" },
  { id: "assets", glyph: "◇", label: "项目" },
  { id: "post-production", glyph: "✦", label: "后期" },
  { id: "delivery", glyph: "↗", label: "交付" },
];

const stateLabels: Record<StageState, string> = {
  waiting: "等待上游",
  ready: "可以开始",
  running: "执行中",
  passed: "已通过",
  attention: "需要处理",
  disabled: "未启用",
};

const jobLabels: Record<JobStatus, string> = {
  queued: "已排队",
  planning: "编导规划中",
  generating: "镜头生成中",
  evaluating: "质量评测中",
  persisting: "素材留存中",
  mastering: "母版合成中",
  upscaling: "4K 交付中",
  composing: "后期包装中",
  completed: "生产完成",
  failed: "执行失败",
  cancelled: "已取消",
};

function authHeaders(apiKey: string): HeadersInit {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `请求失败 (${response.status})`);
  return body;
}

function shortId(value?: string) {
  return value ? value.slice(0, 8).toUpperCase() : "—";
}

function formatTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

export function App() {
  const [view, setView] = useState<ViewId>(() => window.location.hash.slice(1) as ViewId || "overview");
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem("harness-api-key") ?? "");
  const [workspace, setWorkspace] = useState<WorkspaceInfo>({ name: "Video Production Control", controlSurfaces: [] });
  const [runtime, setRuntime] = useState<RuntimeInfo>();
  const [projects, setProjects] = useState<ProductionProject[]>([]);
  const [project, setProject] = useState<ProductionProject>();
  const [projectJobs, setProjectJobs] = useState<VideoJob[]>([]);
  const [job, setJob] = useState<VideoJob>();
  const [selectedShotId, setSelectedShotId] = useState<string>();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>();
  const [showNewRun, setShowNewRun] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showConnection, setShowConnection] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectBrief, setProjectBrief] = useState("");
  const [storySynopsis, setStorySynopsis] = useState("");
  const [brief, setBrief] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(15);
  const [audioUrl, setAudioUrl] = useState("");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [selectedReferenceAssetIds, setSelectedReferenceAssetIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [composition, setComposition] = useState<CompositionPreview>();
  const [compositionTitle, setCompositionTitle] = useState("");
  const [compositionSubtitle, setCompositionSubtitle] = useState("");
  const [compositionSubmitting, setCompositionSubmitting] = useState(false);

  const fetchWorkspace = useCallback(async () => {
    const response = await fetch("/v1/workspace", { headers: authHeaders(apiKey) });
    const result = await parseResponse<{ runtime?: RuntimeInfo; workspace: WorkspaceInfo }>(response);
    setRuntime(result.runtime);
    setWorkspace(result.workspace);
  }, [apiKey]);

  const fetchJob = useCallback(async (id: string) => {
    const response = await fetch(`/v1/video-jobs/${id}`, { headers: authHeaders(apiKey) });
    const result = await parseResponse<VideoJob>(response);
    setJob(result);
    setProjectJobs((current) => current.map((item) => item.id === result.id ? result : item));
    setSelectedShotId((current) => current ?? result.shots[0]?.id);
    return result;
  }, [apiKey]);

  const fetchProjectDetail = useCallback(async (id: string) => {
    const response = await fetch(`/v1/projects/${id}`, { headers: authHeaders(apiKey) });
    const result = await parseResponse<ProjectDetail>(response);
    setProject(result.project);
    setProjectJobs(result.jobs);
    setProjects((current) => current.map((item) => item.id === result.project.id ? result.project : item));
    localStorage.setItem("harness-last-project", result.project.id);
    const currentJob = result.jobs[0];
    setJob(currentJob);
    setSelectedShotId(currentJob?.shots[0]?.id);
    setSelectedCandidateId(undefined);
    return result;
  }, [apiKey]);

  const fetchProjects = useCallback(async () => {
    const response = await fetch("/v1/projects", { headers: authHeaders(apiKey) });
    const result = await parseResponse<ProductionProject[]>(response);
    setProjects(result);
    if (result.length === 0) {
      setProject(undefined);
      setProjectJobs([]);
      setJob(undefined);
      return;
    }
    const remembered = localStorage.getItem("harness-last-project");
    const selected = result.find((item) => item.id === remembered) ?? result[0];
    if (selected) await fetchProjectDetail(selected.id);
  }, [apiKey, fetchProjectDetail]);

  useEffect(() => {
    sessionStorage.setItem("harness-api-key", apiKey);
    void Promise.all([fetchWorkspace(), fetchProjects()]).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "工作区读取失败"));
  }, [apiKey, fetchProjects, fetchWorkspace]);

  useEffect(() => {
    if (!job || ["completed", "failed", "cancelled"].includes(job.status)) return;
    const timer = window.setTimeout(() => void fetchJob(job.id).catch(() => undefined), 1200);
    return () => window.clearTimeout(timer);
  }, [fetchJob, job]);

  useEffect(() => {
    window.location.hash = view;
  }, [view]);

  const selectedShot = job?.shots.find((shot) => shot.id === selectedShotId) ?? job?.shots[0];
  const selectedCandidate = selectedShot?.candidates.find((candidate) => candidate.id === selectedCandidateId)
    ?? selectedShot?.candidates.find((candidate) => candidate.id === selectedShot.selectedCandidateId)
    ?? selectedShot?.candidates.find((candidate) => candidate.outputUrl);
  const allCandidates = useMemo(() => job?.shots.flatMap((shot) => shot.candidates) ?? [], [job]);
  const allAssets = useMemo(() => allCandidates.flatMap((candidate) => [
    ...(candidate.assets ?? []),
    ...(candidate.executions?.flatMap((execution) => execution.assets ?? []) ?? []),
  ]).filter((asset, index, array) => array.findIndex((item) => item.id === asset.id) === index), [allCandidates]);
  const acceptedCount = job?.shots.filter((shot) => shot.selectedCandidateId).length ?? 0;
  const reviewCount = allCandidates.filter((candidate) => candidate.evaluation).length;
  const previewUrl = job?.output?.videoUrl ?? selectedCandidate?.outputUrl;
  const controlSurfaces = useMemo(() => workspace.controlSurfaces.map((surface) => {
    if (surface.id === "comfyui" && project?.workbenchBindings.comfyuiUrl) {
      return { ...surface, url: project.workbenchBindings.comfyuiUrl, status: "configured" as const };
    }
    if (surface.id === "libtv") {
      const projectUrl = project?.workbenchBindings.libtvCanvasUrl
        ?? (project?.workbenchBindings.libtvCanvasUuid ? `https://www.liblib.tv/canvas?projectId=${project.workbenchBindings.libtvCanvasUuid}` : undefined);
      if (projectUrl) return { ...surface, url: projectUrl, status: "configured" as const };
    }
    return surface;
  }), [project, workspace.controlSurfaces]);
  const surfaces = useMemo(() => new Map(controlSurfaces.map((surface) => [surface.id, surface])), [controlSurfaces]);
  const stages = useMemo(() => buildStages(job, runtime, allCandidates), [job, runtime, allCandidates]);
  const progress = Math.round((stages.filter((stage) => stage.state === "passed").length / stages.length) * 100);

  function beginNewRun() {
    if (!project) {
      setShowNewProject(true);
      return;
    }
    setBrief(project.brief);
    setSelectedSceneId("");
    setSelectedReferenceAssetIds(project.assets
      .filter((asset) => ["image", "video", "audio"].includes(asset.mediaType))
      .filter((asset) => ["identity-reference", "appearance-reference", "scene-reference", "style-reference"].includes(asset.role))
      .map((asset) => asset.id)
      .slice(0, 20));
    setShowNewRun(true);
  }

  async function createProject() {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch("/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
        body: JSON.stringify({
          name: projectName,
          brief: projectBrief,
          storySynopsis,
          deliverySpec: { aspectRatio: "16:9", width: 3840, height: 2160, fps: 24 },
        }),
      });
      const created = await parseResponse<ProductionProject>(response);
      setProjects((current) => [created, ...current]);
      setProject(created);
      setProjectJobs([]);
      setJob(undefined);
      localStorage.setItem("harness-last-project", created.id);
      setProjectName("");
      setProjectBrief("");
      setStorySynopsis("");
      setShowNewProject(false);
      setView("assets");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function createJob() {
    if (!project) {
      setShowNewRun(false);
      setShowNewProject(true);
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const projectReferences = project.assets
        .filter((asset) => selectedReferenceAssetIds.includes(asset.id))
        .filter((asset): asset is ProjectAsset & { mediaType: "image" | "video" | "audio" } => ["image", "video", "audio"].includes(asset.mediaType))
        .map((asset) => ({ type: asset.mediaType, url: asset.uri, assetId: asset.id, purpose: asset.role }));
      const references = audioUrl.trim()
        ? [...projectReferences, { type: "audio" as const, url: audioUrl.trim(), purpose: "driving_audio" }]
        : projectReferences;
      const response = await fetch(`/v1/projects/${project.id}/video-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
        body: JSON.stringify({
          brief,
          ...(selectedSceneId ? { sceneId: selectedSceneId } : {}),
          durationSeconds,
          aspectRatio: "16:9",
          outputResolution: "3840x2160",
          references,
          idempotencyKey: `studio-${crypto.randomUUID()}`,
        }),
      });
      const created = await parseResponse<VideoJob>(response);
      setJob(created);
      setProjectJobs((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedShotId(undefined);
      setSelectedCandidateId(undefined);
      setShowNewRun(false);
      setView("pipeline");
      void fetchProjectDetail(project.id).catch(() => undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function retryJob() {
    if (!job) return;
    const response = await fetch(`/v1/video-jobs/${job.id}/retry`, { method: "POST", headers: authHeaders(apiKey) });
    setJob(await parseResponse<VideoJob>(response));
  }

  async function createCompositionPreview() {
    setCompositionSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch("/v1/compositions/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
        body: JSON.stringify({
          template: "kinetic-character",
          title: compositionTitle,
          subtitle: compositionSubtitle,
          kicker: "PRODUCTION CONTROL",
          ...(previewUrl?.startsWith("https://") ? { backgroundVideoUrl: previewUrl } : {}),
          durationSeconds: 10,
          theme: "cinema",
          motion: "scale-in",
          accentColor: "#a5ffcc",
        }),
      });
      setComposition(await parseResponse<CompositionPreview>(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "后期预览生成失败");
    } finally {
      setCompositionSubmitting(false);
    }
  }

  return (
    <div className="control-shell">
      <header className="control-topbar">
        <div className="brand-lockup">
          <div className="brand-symbol"><span>V</span></div>
          <div><strong>VIDEO HARNESS</strong><small>PRODUCTION CONTROL</small></div>
        </div>
        <div className="run-identity">
          <span className="eyebrow">ACTIVE PROJECT</span>
          <strong>{project?.name ?? "尚未创建项目"}</strong>
          <small>{job ? `${job.plan?.title ?? "当前生产任务"} · RUN ${shortId(job.id)} · ${job.request.durationSeconds}s` : project ? `${project.scenes.length} 场景 · ${project.assets.length} 资产 · 等待生产任务` : "先建立项目，再组织素材与分镜"}</small>
        </div>
        <div className="topbar-actions">
          <select className="project-switcher" aria-label="当前项目" value={project?.id ?? ""} onChange={(event) => { if (event.target.value) void fetchProjectDetail(event.target.value); }}>
            <option value="">选择项目</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="system-pill" type="button" onClick={() => setShowConnection((value) => !value)}>
            <i className="pulse-dot" /> Harness {runtime ? "Ready" : "Connecting"}
          </button>
          <button className="quiet-button" type="button" onClick={() => void Promise.all([fetchWorkspace(), fetchProjects()])}>刷新</button>
          <button className="quiet-button" type="button" onClick={() => setShowNewProject(true)}>＋ 项目</button>
          <button className="primary-button" type="button" onClick={beginNewRun}>＋ 生产任务</button>
        </div>
        {showConnection && (
          <div className="connection-card">
            <label htmlFor="harness-key">Harness API Token</label>
            <input id="harness-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="本地未启用鉴权时留空" />
            <p>这里只保存当前会话的 Harness Token。云账号和 Provider Key 只从服务端 `.env.local` 读取。</p>
          </div>
        )}
      </header>

      <div className="control-layout">
        <nav className="control-rail" aria-label="生产控制台导航">
          {navigation.map((item) => (
            <button key={item.id} type="button" className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <span>{item.glyph}</span><small>{item.label}</small>
            </button>
          ))}
          <div className="rail-spacer" />
          <button type="button" onClick={() => setShowConnection(true)}><span>⚙</span><small>设置</small></button>
        </nav>

        <main className="control-main">
          {error && <div className="error-strip" role="alert"><strong>需要处理</strong><span>{error}</span><button type="button" onClick={() => setError(undefined)}>×</button></div>}
          {view === "overview" && (
            <Overview
              job={job}
              progress={progress}
              stages={stages}
              surfaces={surfaces}
              previewUrl={previewUrl}
              selectedCandidate={selectedCandidate}
              acceptedCount={acceptedCount}
              reviewCount={reviewCount}
              assetCount={allAssets.length}
              project={project}
              projectJobs={projectJobs}
              onOpenView={setView}
            />
          )}
          {view === "pipeline" && (
            <PipelineView
              job={job}
              stages={stages}
              surfaces={surfaces}
              selectedShot={selectedShot}
              selectedCandidate={selectedCandidate}
              onSelectShot={(shot) => { setSelectedShotId(shot.id); setSelectedCandidateId(undefined); }}
              onSelectCandidate={setSelectedCandidateId}
              onOpenView={setView}
            />
          )}
          {view === "assets" && <ProjectView project={project} jobs={projectJobs} job={job} assets={allAssets} apiKey={apiKey} onProjectUpdated={(updated) => { setProject(updated); setProjects((current) => current.map((item) => item.id === updated.id ? updated : item)); }} />}
          {view === "post-production" && (
            <section className="workspace-section" id="post-production">
              <SectionTitle eyebrow="DETERMINISTIC POST" title="后期包装与动效" description="AI 视频作为底片，HyperFrames 负责可复现的文字、数据图形和节拍包装。" />
              <div className="post-grid">
                <div className="post-form surface-panel">
                  <label>主标题<input value={compositionTitle} onChange={(event) => setCompositionTitle(event.target.value)} /></label>
                  <label>副标题<textarea value={compositionSubtitle} onChange={(event) => setCompositionSubtitle(event.target.value)} /></label>
                  <div className="source-summary"><span>背景素材</span><strong>{previewUrl ? "当前已选视频候选" : "尚无可用候选"}</strong></div>
                  <button className="primary-button wide" type="button" disabled={compositionSubmitting || !compositionTitle.trim()} onClick={() => void createCompositionPreview()}>
                    {compositionSubmitting ? "编译中…" : "生成 HyperFrames 预览"}
                  </button>
                </div>
                <div className="post-preview surface-panel">
                  <div className="media-canvas"><HyperframesPreview previewUrl={composition?.previewUrl} compositionId={composition?.id} /></div>
                  <div className="preview-footer"><span>1920 × 1080 · 10s</span><strong>{composition ? composition.lint.warningCount === 0 ? "Lint 通过" : `${composition.lint.warningCount} 条警告` : "等待编译"}</strong></div>
                </div>
              </div>
            </section>
          )}
          {view === "delivery" && <DeliveryView job={job} onRetry={() => void retryJob()} />}
        </main>

        <aside className="operations-sidebar">
          <div className="sidebar-heading"><span>CONTROL SURFACES</span><strong>生产工具</strong></div>
          <div className="surface-list">
            {controlSurfaces.map((surface) => (
              <SurfaceCard key={surface.id} surface={surface} onEmbeddedOpen={() => setView(surface.id === "hyperframes" ? "post-production" : "delivery")} />
            ))}
          </div>
          <div className="sidebar-heading compact"><span>RUN HEALTH</span><strong>任务健康度</strong></div>
          <div className="health-panel">
            <div><span>运行状态</span><strong className={job?.status === "failed" ? "danger" : "good"}>{job ? jobLabels[job.status] : "待创建"}</strong></div>
            <div><span>合格镜头</span><strong>{acceptedCount} / {job?.shots.length ?? 0}</strong></div>
            <div><span>评测报告</span><strong>{reviewCount}</strong></div>
            <div><span>最近检查点</span><strong>{formatTime(job?.updatedAt)}</strong></div>
          </div>
          <div className="sidebar-heading compact"><span>POLICY</span><strong>当前策略</strong></div>
          <div className="policy-card">
            <span>{runtime?.generationPipeline === "comfyui-libtv" ? "H3 CONTROL → LIBTV" : "DIRECT / MOCK"}</span>
            <p>{runtime?.generationPipeline === "comfyui-libtv" ? "先生成动作骨架，再在线精修。每个阶段独立留存和评测。" : "当前运行时尚未启用高控制主链，可验证 Harness 状态机但不代表生产效果。"}</p>
          </div>
        </aside>
      </div>

      {showNewProject && (
        <div className="drawer-backdrop" onMouseDown={() => setShowNewProject(false)}>
          <section className="new-run-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-heading"><div><span>NEW PROJECT</span><h2>建立项目内容空间</h2></div><button type="button" onClick={() => setShowNewProject(false)}>×</button></div>
            <label>项目名称<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：门口反转短片" /></label>
            <label>创作 Brief<textarea value={projectBrief} onChange={(event) => setProjectBrief(event.target.value)} placeholder="描述作品目标、受众、角色、场景、风格和交付用途。" /></label>
            <label>故事梗概（可继续完善）<textarea value={storySynopsis} onChange={(event) => setStorySynopsis(event.target.value)} placeholder="记录全片故事线和关键冲突。" /></label>
            <div className="run-route"><span>项目结构</span><strong>Project → Story Scenes → Character / Scene Packs → Assets → Video Jobs → Delivery</strong></div>
            <button className="primary-button wide" type="button" disabled={submitting || projectName.trim().length < 1 || projectBrief.trim().length < 3} onClick={() => void createProject()}>{submitting ? "创建中…" : "创建项目并进入资产库"}</button>
          </section>
        </div>
      )}

      {showNewRun && (
        <div className="drawer-backdrop" onMouseDown={() => setShowNewRun(false)}>
          <section className="new-run-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-heading"><div><span>NEW PRODUCTION</span><h2>创建视频生产任务</h2></div><button type="button" onClick={() => setShowNewRun(false)}>×</button></div>
            <div className="run-route"><span>所属项目</span><strong>{project?.name ?? "未选择项目"}</strong></div>
            {project?.scenes.length ? <label>故事场景<select value={selectedSceneId} onChange={(event) => { const sceneId = event.target.value; setSelectedSceneId(sceneId); const scene = project.scenes.find((item) => item.id === sceneId); if (scene) { setBrief(scene.summary); setDurationSeconds(Math.min(60, Math.max(5, scene.durationSeconds))); } }}><option value="">不绑定具体场景</option>{project.scenes.map((scene) => <option key={scene.id} value={scene.id}>{String(scene.index + 1).padStart(2, "0")} · {scene.title}</option>)}</select></label> : null}
            <label>创作目标<textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="描述故事目标、角色、场景、关键动作、镜头语言和交付用途。" /></label>
            <div className="drawer-row">
              <label>总时长<select value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))}><option value={5}>5 秒</option><option value={10}>10 秒</option><option value={15}>15 秒</option><option value={30}>30 秒</option><option value={60}>60 秒</option></select></label>
              <label>交付规格<input value="16:9 · 3840 × 2160" disabled /></label>
            </div>
            {project?.assets.some((asset) => ["image", "video", "audio"].includes(asset.mediaType)) ? <fieldset className="reference-picker"><legend>项目参考素材</legend>{project.assets.filter((asset) => ["image", "video", "audio"].includes(asset.mediaType)).map((asset) => <label key={asset.id}><input type="checkbox" checked={selectedReferenceAssetIds.includes(asset.id)} onChange={(event) => setSelectedReferenceAssetIds((current) => event.target.checked ? [...current, asset.id].slice(0, 20) : current.filter((id) => id !== asset.id))} /><span><strong>{asset.name}</strong><small>{asset.role} · v{asset.version}</small></span></label>)}</fieldset> : null}
            <label>驱动音频 URL（可选）<input type="url" value={audioUrl} onChange={(event) => setAudioUrl(event.target.value)} placeholder="https://…/soundtrack.mp3" /></label>
            <div className="run-route"><span>计划链路</span><strong>Creative Director → H3 → LibTV → Quality Gate → Post → 4K</strong></div>
            <button className="primary-button wide" type="button" disabled={submitting || brief.trim().length < 3} onClick={() => void createJob()}>{submitting ? "创建中…" : "创建并开始规划"}</button>
          </section>
        </div>
      )}
    </div>
  );
}

function Overview(props: {
  job: VideoJob | undefined;
  progress: number;
  stages: PipelineStage[];
  surfaces: Map<string, ControlSurface>;
  previewUrl: string | undefined;
  selectedCandidate: Candidate | undefined;
  acceptedCount: number;
  reviewCount: number;
  assetCount: number;
  project: ProductionProject | undefined;
  projectJobs: VideoJob[];
  onOpenView: (view: ViewId) => void;
}) {
  return (
    <section className="workspace-section">
      <div className="overview-hero">
        <div>
          <span className="eyebrow">PRODUCTION OVERVIEW</span>
          <h1>{props.project?.name ?? "项目、素材与镜头的生产总控"}</h1>
          <p>{props.project?.brief ?? "Harness Studio 保存项目主数据、素材职责、镜头版本、质量决策和交付记录；ComfyUI 与 LibTV 保留各自的专业画布，通过统一资产 ID 和任务状态接入。"}</p>
        </div>
        <div className="progress-orbit"><strong>{props.progress}%</strong><span>流程完成度</span></div>
      </div>
      <div className="metric-grid">
        <Metric label="故事场景" value={String(props.project?.scenes.length ?? 0)} note="Story Scene" />
        <Metric label="角色 / 场景包" value={`${props.project?.characterPacks.length ?? 0} / ${props.project?.scenePacks.length ?? 0}`} note="Consistency Packs" />
        <Metric label="项目资产" value={String(props.project?.assets.length ?? 0)} note={`当前运行产物 ${props.assetCount}`} />
        <Metric label="生产任务" value={String(props.projectJobs.length)} note={props.job ? `${props.acceptedCount}/${props.job.shots.length} 合格镜头 · ${props.reviewCount} 份评测` : "等待第一个任务"} />
      </div>
      <div className="project-context-grid">
        <article className="surface-panel project-context-card"><span>STORY</span><h3>{props.project?.storySynopsis ? "故事主线已建立" : "等待故事梗概"}</h3><p>{props.project?.storySynopsis || "在项目页登记故事场景，再把每个场景拆成多个可生成镜头。"}</p><button type="button" onClick={() => props.onOpenView("assets")}>管理故事与素材 →</button></article>
        <article className="surface-panel project-context-card"><span>WORKBENCH BINDINGS</span><h3>ComfyUI + LibTV</h3><p>{props.project?.workbenchBindings.comfyuiProfileId ? `H3 Profile：${props.project.workbenchBindings.comfyuiProfileId}` : "尚未绑定项目级 H3 Profile"}<br />{props.project?.workbenchBindings.libtvCanvasUuid ? `LibTV Canvas：${shortId(props.project.workbenchBindings.libtvCanvasUuid)}` : "尚未绑定项目级 LibTV Canvas"}</p><button type="button" onClick={() => props.onOpenView("assets")}>查看项目绑定 →</button></article>
        <article className="surface-panel project-context-card"><span>CURRENT RUN</span><h3>{props.job ? jobLabels[props.job.status] : "尚无生产任务"}</h3><p>{props.job ? `${props.job.plan?.title ?? props.job.request.brief} · ${props.job.request.durationSeconds}s · ${formatTime(props.job.updatedAt)}` : "项目内容准备后，从场景创建生产任务。"}</p><button type="button" onClick={() => props.onOpenView("pipeline")}>查看运行流程 →</button></article>
      </div>
      <div className="section-bar"><div><span>WORKSPACE BOUNDARY</span><h2>一个入口，三个明确职责</h2></div><small>入口与数据合并，专业编辑器保持独立</small></div>
      <div className="workspace-map">
        <article className="workspace-map-card primary"><span>PROJECT CONTROL PLANE</span><h3>Harness Studio</h3><p>项目、故事、角色包、场景包、分镜、候选版本、评价、成本与交付的唯一事实来源。</p><strong>当前所在</strong></article>
        <div className="workspace-map-link"><b>Profile / Asset ID</b><i>↔</i><small>状态与产物回收</small></div>
        <article className="workspace-map-card"><span>LOW-LEVEL WORKBENCH</span><h3>ComfyUI</h3><p>编辑并执行 H3、LoRA、ControlNet、Sampler、VAE 等底层节点工作流。</p><strong>精细控制画布 ↗</strong></article>
        <div className="workspace-map-link"><b>Canvas / Node ID</b><i>↔</i><small>候选与任务回收</small></div>
        <article className="workspace-map-card"><span>CREATIVE WORKBENCH</span><h3>LibTV 无限画布</h3><p>空间化创意探索、素材关系、在线模型候选与需要人工参与的创意组装。</p><strong>创意画布 ↗</strong></article>
      </div>
      <div className="section-bar"><div><span>PRODUCTION PIPELINE</span><h2>端到端生产链路</h2></div><button type="button" onClick={() => props.onOpenView("pipeline")}>查看全部细节 →</button></div>
      <div className="stage-flow">
        {props.stages.map((stage, index) => <StageCard key={stage.id} stage={stage} surface={stage.surfaceId ? props.surfaces.get(stage.surfaceId) : undefined} onOpenView={props.onOpenView} showConnector={index < props.stages.length - 1} />)}
      </div>
      <div className="focus-grid">
        <div className="surface-panel media-panel">
          <div className="panel-title"><div><span>SELECTED OUTPUT</span><strong>当前选择</strong></div><button type="button" onClick={() => props.onOpenView("assets")}>全部产物</button></div>
          <div className="media-canvas">
            {props.previewUrl ? <video key={props.previewUrl} src={props.previewUrl} controls playsInline /> : <EmptyMedia />}
          </div>
          <div className="preview-footer"><span>{props.selectedCandidate ? `${props.selectedCandidate.provider} · ${shortId(props.selectedCandidate.providerTaskId)}` : "尚无候选"}</span><strong>{props.selectedCandidate?.evaluation ? `质量分 ${(props.selectedCandidate.evaluation.overallScore * 100).toFixed(0)}` : "等待质量门"}</strong></div>
        </div>
        <div className="surface-panel activity-panel">
          <div className="panel-title"><div><span>LATEST CHECKPOINTS</span><strong>最近事件</strong></div></div>
          {(props.job?.events ?? []).slice(-6).reverse().map((event, index) => <div className="activity-row" key={`${event.at}-${index}`}><i /><time>{formatTime(event.at)}</time><div><strong>{jobLabels[event.status]}</strong><span>{event.message ?? "状态已持久化"}</span></div></div>)}
          {!props.job?.events?.length && <div className="empty-list">创建任务后，所有规划、执行、评测和交付检查点会显示在这里。</div>}
        </div>
      </div>
    </section>
  );
}

function PipelineView(props: {
  job: VideoJob | undefined;
  stages: PipelineStage[];
  surfaces: Map<string, ControlSurface>;
  selectedShot: Shot | undefined;
  selectedCandidate: Candidate | undefined;
  onSelectShot: (shot: Shot) => void;
  onSelectCandidate: (id: string) => void;
  onOpenView: (view: ViewId) => void;
}) {
  return (
    <section className="workspace-section">
      <SectionTitle eyebrow="ORCHESTRATION" title="生产流程控制" description="Harness 聚合状态与产物；专业节点和模型参数在对应画布内完成。" />
      <div className="pipeline-stack">
        {props.stages.map((stage) => <StageRow key={stage.id} stage={stage} surface={stage.surfaceId ? props.surfaces.get(stage.surfaceId) : undefined} onOpenView={props.onOpenView} />)}
      </div>
      <div className="section-bar secondary"><div><span>SHOT MANIFEST</span><h2>分镜与候选</h2></div><small>{props.job ? `${props.job.shots.length} 个镜头` : "等待规划"}</small></div>
      <div className="shot-workspace">
        <div className="shot-list">
          {(props.job?.shots ?? []).map((shot) => <button key={shot.id} type="button" className={props.selectedShot?.id === shot.id ? "selected" : ""} onClick={() => props.onSelectShot(shot)}><span>{String(shot.index + 1).padStart(2, "0")}</span><div><strong>{shot.prompt}</strong><small>{shot.durationSeconds}s · {shot.candidates.length} candidates · {shot.status}</small></div><i>{shot.selectedCandidateId ? "✓" : "→"}</i></button>)}
          {!props.job?.shots.length && <div className="empty-list">Creative Director 完成规划后，会在这里生成结构化 Shot Manifest。</div>}
        </div>
        <div className="candidate-detail surface-panel">
          <div className="media-canvas small">{props.selectedCandidate?.outputUrl ? <video src={props.selectedCandidate.outputUrl} controls playsInline /> : <EmptyMedia />}</div>
          <div className="candidate-tabs">{props.selectedShot?.candidates.map((candidate, index) => <button type="button" key={candidate.id} className={props.selectedCandidate?.id === candidate.id ? "active" : ""} onClick={() => props.onSelectCandidate(candidate.id)}>候选 {index + 1}</button>)}</div>
          <dl className="candidate-metadata"><div><dt>Recipe</dt><dd>{props.selectedCandidate?.recipe?.profile ?? "—"}</dd></div><div><dt>Provider</dt><dd>{props.selectedCandidate?.provider ?? "—"}</dd></div><div><dt>Quality</dt><dd>{props.selectedCandidate?.evaluation ? `${(props.selectedCandidate.evaluation.overallScore * 100).toFixed(0)} / 100` : "待评测"}</dd></div><div><dt>Decision</dt><dd>{props.selectedCandidate?.evaluation?.decision ?? "—"}</dd></div></dl>
        </div>
      </div>
    </section>
  );
}

function ProjectView({ project, jobs, job, assets, apiKey, onProjectUpdated }: { project: ProductionProject | undefined; jobs: VideoJob[]; job: VideoJob | undefined; assets: GenerationAsset[]; apiKey: string; onProjectUpdated: (project: ProductionProject) => void }) {
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [assetName, setAssetName] = useState("");
  const [assetUri, setAssetUri] = useState("");
  const [assetMediaType, setAssetMediaType] = useState<ProjectAssetMediaType>("image");
  const [assetRole, setAssetRole] = useState<ProjectAssetRole>("identity-reference");
  const [characterName, setCharacterName] = useState("");
  const [characterAssetIds, setCharacterAssetIds] = useState<string[]>([]);
  const [scenePackName, setScenePackName] = useState("");
  const [sceneAssetIds, setSceneAssetIds] = useState<string[]>([]);
  const [sceneLocation, setSceneLocation] = useState("");
  const [sceneLighting, setSceneLighting] = useState("");
  const [storyTitle, setStoryTitle] = useState("");
  const [storySummary, setStorySummary] = useState("");
  const [storyDuration, setStoryDuration] = useState(15);
  const [storyCharacterIds, setStoryCharacterIds] = useState<string[]>([]);
  const [storyScenePackId, setStoryScenePackId] = useState("");
  const [shotBriefs, setShotBriefs] = useState("");
  const [comfyuiProfileId, setComfyuiProfileId] = useState(project?.workbenchBindings.comfyuiProfileId ?? "");
  const [comfyuiUrl, setComfyuiUrl] = useState(project?.workbenchBindings.comfyuiUrl ?? "");
  const [libtvCanvasUuid, setLibtvCanvasUuid] = useState(project?.workbenchBindings.libtvCanvasUuid ?? "");
  const [libtvCanvasUrl, setLibtvCanvasUrl] = useState(project?.workbenchBindings.libtvCanvasUrl ?? "");

  useEffect(() => {
    setComfyuiProfileId(project?.workbenchBindings.comfyuiProfileId ?? "");
    setComfyuiUrl(project?.workbenchBindings.comfyuiUrl ?? "");
    setLibtvCanvasUuid(project?.workbenchBindings.libtvCanvasUuid ?? "");
    setLibtvCanvasUrl(project?.workbenchBindings.libtvCanvasUrl ?? "");
  }, [project?.id, project?.workbenchBindings]);

  if (!project) return <section className="workspace-section"><SectionTitle eyebrow="PROJECT ASSET GRAPH" title="先建立一个生产项目" description="项目是故事、人物、场景、素材、生成任务和交付记录的唯一事实来源。" /><div className="empty-list surface-panel">点击右上角“＋ 项目”建立第一个项目。</div></section>;

  const selected = job?.shots.flatMap((shot) => shot.candidates.filter((candidate) => candidate.id === shot.selectedCandidateId)) ?? [];

  async function mutate(path: string, payload: unknown): Promise<boolean> {
    setSaving(true);
    setLocalError(undefined);
    try {
      const response = await fetch(`/v1/projects/${project!.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
        body: JSON.stringify(payload),
      });
      onProjectUpdated(await parseResponse<ProductionProject>(response));
      return true;
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : "项目更新失败");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitAsset() {
    if (!await mutate("assets", { name: assetName, uri: assetUri, mediaType: assetMediaType, role: assetRole, tags: [] })) return;
    setAssetName("");
    setAssetUri("");
  }

  async function submitCharacterPack() {
    if (!await mutate("character-packs", { name: characterName, referenceAssetIds: characterAssetIds, negativeConstraints: [] })) return;
    setCharacterName("");
    setCharacterAssetIds([]);
  }

  async function submitScenePack() {
    if (!await mutate("scene-packs", { name: scenePackName, referenceAssetIds: sceneAssetIds, location: sceneLocation, lighting: sceneLighting })) return;
    setScenePackName("");
    setSceneAssetIds([]);
    setSceneLocation("");
    setSceneLighting("");
  }

  async function submitStoryScene() {
    if (!await mutate("scenes", {
      title: storyTitle,
      summary: storySummary,
      durationSeconds: storyDuration,
      characterPackIds: storyCharacterIds,
      ...(storyScenePackId ? { scenePackId: storyScenePackId } : {}),
      shotBriefs: shotBriefs.split("\n").map((item) => item.trim()).filter(Boolean),
    })) return;
    setStoryTitle("");
    setStorySummary("");
    setStoryCharacterIds([]);
    setStoryScenePackId("");
    setShotBriefs("");
  }

  async function submitWorkbenchBindings() {
    setSaving(true);
    setLocalError(undefined);
    try {
      const response = await fetch(`/v1/projects/${project!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
        body: JSON.stringify({
          workbenchBindings: {
            ...(comfyuiProfileId.trim() ? { comfyuiProfileId: comfyuiProfileId.trim() } : {}),
            ...(comfyuiUrl.trim() ? { comfyuiUrl: comfyuiUrl.trim() } : {}),
            ...(libtvCanvasUuid.trim() ? { libtvCanvasUuid: libtvCanvasUuid.trim() } : {}),
            ...(libtvCanvasUrl.trim() ? { libtvCanvasUrl: libtvCanvasUrl.trim() } : {}),
          },
        }),
      });
      onProjectUpdated(await parseResponse<ProductionProject>(response));
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : "工作台绑定失败");
    } finally {
      setSaving(false);
    }
  }

  return <section className="workspace-section">
    <SectionTitle eyebrow="PROJECT SYSTEM OF RECORD" title={project.name} description={project.brief} />
    {localError && <div className="error-strip"><strong>项目更新失败</strong><span>{localError}</span><button type="button" onClick={() => setLocalError(undefined)}>×</button></div>}
    <div className="project-structure-grid">
      <ProjectCollection title="故事场景" count={project.scenes.length} actionLabel="新增场景">
        {project.scenes.map((scene) => <div className="collection-row" key={scene.id}><span>{String(scene.index + 1).padStart(2, "0")}</span><div><strong>{scene.title}</strong><small>{scene.durationSeconds}s · {scene.shotBriefs.length} 个镜头意图 · {scene.videoJobIds.length} 个任务</small></div></div>)}
        {!project.scenes.length && <div className="collection-empty">还没有故事场景</div>}
        <ProjectEditor summary="＋ 新增故事场景"><label>场景标题<input value={storyTitle} onChange={(event) => setStoryTitle(event.target.value)} /></label><label>场景动作与剧情<textarea value={storySummary} onChange={(event) => setStorySummary(event.target.value)} /></label><label>预期时长<input type="number" min={5} max={300} value={storyDuration} onChange={(event) => setStoryDuration(Number(event.target.value))} /></label>{project.characterPacks.length ? <CheckList label="参与角色" items={project.characterPacks} selected={storyCharacterIds} onChange={setStoryCharacterIds} /> : null}{project.scenePacks.length ? <label>场景包<select value={storyScenePackId} onChange={(event) => setStoryScenePackId(event.target.value)}><option value="">不绑定</option>{project.scenePacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label> : null}<label>镜头意图（每行一个）<textarea value={shotBriefs} onChange={(event) => setShotBriefs(event.target.value)} /></label><button className="primary-button wide" type="button" disabled={saving || !storyTitle.trim() || !storySummary.trim()} onClick={() => void submitStoryScene()}>保存场景</button></ProjectEditor>
      </ProjectCollection>
      <ProjectCollection title="角色一致性包" count={project.characterPacks.length} actionLabel="新增角色">
        {project.characterPacks.map((pack) => <div className="collection-row" key={pack.id}><span>CP</span><div><strong>{pack.name}</strong><small>{pack.referenceAssetIds.length} 个身份/外观参考</small></div></div>)}
        {!project.characterPacks.length && <div className="collection-empty">还没有角色包</div>}
        <ProjectEditor summary="＋ 新增角色包"><label>角色名称<input value={characterName} onChange={(event) => setCharacterName(event.target.value)} /></label>{project.assets.length ? <CheckList label="身份与外观素材" items={project.assets.filter((asset) => asset.mediaType === "image")} selected={characterAssetIds} onChange={setCharacterAssetIds} /> : <p>请先登记角色参考图片。</p>}<button className="primary-button wide" type="button" disabled={saving || !characterName.trim()} onClick={() => void submitCharacterPack()}>保存角色包</button></ProjectEditor>
      </ProjectCollection>
      <ProjectCollection title="场景连续性包" count={project.scenePacks.length} actionLabel="新增场景包">
        {project.scenePacks.map((pack) => <div className="collection-row" key={pack.id}><span>SP</span><div><strong>{pack.name}</strong><small>{pack.location || "未填写地点"} · {pack.lighting || "未填写光线"}</small></div></div>)}
        {!project.scenePacks.length && <div className="collection-empty">还没有场景包</div>}
        <ProjectEditor summary="＋ 新增场景包"><label>场景包名称<input value={scenePackName} onChange={(event) => setScenePackName(event.target.value)} /></label><label>地点<input value={sceneLocation} onChange={(event) => setSceneLocation(event.target.value)} /></label><label>光线<input value={sceneLighting} onChange={(event) => setSceneLighting(event.target.value)} /></label>{project.assets.length ? <CheckList label="场景参考素材" items={project.assets} selected={sceneAssetIds} onChange={setSceneAssetIds} /> : null}<button className="primary-button wide" type="button" disabled={saving || !scenePackName.trim()} onClick={() => void submitScenePack()}>保存场景包</button></ProjectEditor>
      </ProjectCollection>
      <ProjectCollection title="工作台绑定" count={Number(Boolean(project.workbenchBindings.comfyuiProfileId)) + Number(Boolean(project.workbenchBindings.libtvCanvasUuid))} actionLabel="项目级">
        <div className="binding-row"><span>CU</span><div><strong>ComfyUI Profile</strong><small>{project.workbenchBindings.comfyuiProfileId ?? "使用运行时默认 Profile"}</small></div></div>
        <div className="binding-row"><span>LT</span><div><strong>LibTV Canvas</strong><small>{project.workbenchBindings.libtvCanvasUuid ?? "尚未绑定"}</small></div></div>
        <p className="collection-note">凭据、内网地址和本机路径不写入仓库；这里只保存项目级非敏感绑定标识。</p>
        <ProjectEditor summary="配置项目工作台"><label>ComfyUI Profile ID<input value={comfyuiProfileId} onChange={(event) => setComfyuiProfileId(event.target.value)} /></label><label>ComfyUI 工作台 URL<input type="url" value={comfyuiUrl} onChange={(event) => setComfyuiUrl(event.target.value)} placeholder="http://192.168.x.x:8188" /></label><label>LibTV Canvas UUID<input value={libtvCanvasUuid} onChange={(event) => setLibtvCanvasUuid(event.target.value)} /></label><label>LibTV Canvas URL<input type="url" value={libtvCanvasUrl} onChange={(event) => setLibtvCanvasUrl(event.target.value)} /></label><button className="primary-button wide" type="button" disabled={saving} onClick={() => void submitWorkbenchBindings()}>保存绑定</button></ProjectEditor>
      </ProjectCollection>
    </div>
    <div className="section-bar"><div><span>PROJECT ASSET GRAPH</span><h2>素材登记与跨工具产物血缘</h2></div><small>{project.assets.length} 个项目素材 · {jobs.length} 个生产任务</small></div>
    <ProjectEditor summary="＋ 登记输入素材"><div className="editor-grid"><label>素材名称<input value={assetName} onChange={(event) => setAssetName(event.target.value)} /></label><label>媒体类型<select value={assetMediaType} onChange={(event) => setAssetMediaType(event.target.value as ProjectAssetMediaType)}>{["image", "video", "audio", "document", "workflow"].map((item) => <option key={item}>{item}</option>)}</select></label><label>素材职责<select value={assetRole} onChange={(event) => setAssetRole(event.target.value as ProjectAssetRole)}>{["identity-reference", "appearance-reference", "action-reference", "camera-reference", "scene-reference", "style-reference", "voice-reference", "music", "other"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="span-two">URI<input type="url" value={assetUri} onChange={(event) => setAssetUri(event.target.value)} placeholder="https://… 或 file:///…" /></label></div><button className="primary-button" type="button" disabled={saving || !assetName.trim() || !assetUri.trim()} onClick={() => void submitAsset()}>登记素材</button></ProjectEditor>
    <div className="asset-lanes">
      <AssetLane label="01 · 项目输入素材" count={project.assets.length}>{project.assets.map((asset) => <AssetCard key={asset.id} title={asset.name} meta={`${asset.role} · ${asset.source} · v${asset.version}`} url={asset.uri} mediaLabel={asset.mediaType.toUpperCase()} />)}</AssetLane>
      <AssetLane label="02 · ComfyUI 控制资产" count={assets.filter((asset) => asset.role !== "final-video").length}>{assets.filter((asset) => asset.role !== "final-video").map((asset) => <AssetCard key={asset.id} title={asset.role} meta={asset.sourceExecutor} url={asset.uri} mediaLabel={asset.mediaType.toUpperCase()} />)}</AssetLane>
      <AssetLane label="03 · LibTV / 在线最终候选" count={assets.filter((asset) => asset.role === "final-video").length}>{assets.filter((asset) => asset.role === "final-video").map((asset) => <AssetCard key={asset.id} title="final-video" meta={asset.sourceExecutor} url={asset.uri} />)}</AssetLane>
      <AssetLane label="04 · 合格镜头" count={selected.length}>{selected.map((candidate) => <AssetCard key={candidate.id} title={`Accepted ${shortId(candidate.id)}`} meta={`${candidate.provider} · ${candidate.evaluation ? (candidate.evaluation.overallScore * 100).toFixed(0) : "—"}`} url={candidate.outputUrl} />)}</AssetLane>
      <AssetLane label="05 · 母版与交付" count={job?.output ? 1 : 0}>{job?.output && <AssetCard title="4K Delivery Manifest" meta={`${job.output.width} × ${job.output.height} · ${job.output.deliveryMode}`} url={job.output.videoUrl ?? job.output.manifestUrl} />}</AssetLane>
    </div>
  </section>;
}

function DeliveryView({ job, onRetry }: { job: VideoJob | undefined; onRetry: () => void }) {
  return <section className="workspace-section" id="delivery"><SectionTitle eyebrow="DELIVERY CONTROL" title="母版、4K 与交付" description="AI 生成后的编码、超分、技术 QC、签发和归档属于确定性交付管线。" /><div className="delivery-grid"><div className="surface-panel delivery-status"><span className="eyebrow">CURRENT DELIVERY</span><h2>{job ? jobLabels[job.status] : "尚无生产任务"}</h2><p>{job?.output ? "交付 Manifest 已生成，可从记录中追溯全部合格镜头与 Provider 任务。" : "完成质量门和后期组装后，Harness 才会启动母版与 4K 交付。"}</p><div className="delivery-specs"><div><span>画布</span><strong>3840 × 2160</strong></div><div><span>比例</span><strong>16:9</strong></div><div><span>模式</span><strong>{job?.output?.deliveryMode ?? "—"}</strong></div><div><span>Manifest</span><strong>{job?.output ? shortId(job.id) : "—"}</strong></div></div>{job?.status === "failed" && job.error?.retryable && <button className="primary-button" type="button" onClick={onRetry}>从检查点重试</button>}{job?.output?.videoUrl && <a className="primary-button link-button" href={job.output.videoUrl} target="_blank" rel="noreferrer">打开交付视频 ↗</a>}</div><div className="surface-panel qc-list"><div className="panel-title"><div><span>TECHNICAL QC</span><strong>交付门禁</strong></div></div>{["合格镜头清单完整", "1080P 母版可读取", "4K 超分任务完成", "帧率与编码符合策略", "音轨与时长通过检查", "Manifest 与资产归档完成"].map((item, index) => <div className="qc-row" key={item}><i className={job?.status === "completed" ? "done" : index === 0 && job?.shots.some((shot) => shot.selectedCandidateId) ? "done" : ""}>{job?.status === "completed" ? "✓" : index + 1}</i><span>{item}</span></div>)}</div></div></section>;
}

function ProjectCollection({ title, count, actionLabel, children }: { title: string; count: number; actionLabel: string; children: React.ReactNode }) {
  return <section className="project-collection surface-panel"><div className="project-collection-head"><div><span>{actionLabel}</span><h3>{title}</h3></div><strong>{count}</strong></div><div className="project-collection-body">{children}</div></section>;
}

function ProjectEditor({ summary, children }: { summary: string; children: React.ReactNode }) {
  return <details className="project-editor"><summary>{summary}</summary><div className="project-editor-body">{children}</div></details>;
}

function CheckList<T extends { id: string; name: string }>({ label, items, selected, onChange }: { label: string; items: T[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <fieldset className="compact-checklist"><legend>{label}</legend>{items.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => onChange(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} /><span>{item.name}</span></label>)}</fieldset>;
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="page-heading"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function EmptyMedia() { return <div className="empty-media"><span>VAH</span><strong>等待生产产物</strong><small>候选通过质量门后将在这里显示</small></div>; }

function SurfaceCard({ surface, onEmbeddedOpen }: { surface: ControlSurface; onEmbeddedOpen: () => void }) {
  const content = <><div className="surface-card-head"><span className={`surface-icon ${surface.id}`}>{surface.id === "comfyui" ? "CU" : surface.id === "libtv" ? "LT" : surface.id === "hyperframes" ? "HF" : "4K"}</span><div><strong>{surface.name}</strong><small>{surface.kind === "external" ? "EXTERNAL CANVAS" : "HARNESS MODULE"}</small></div><i className={surface.status}>{surface.status === "ready" || surface.status === "configured" ? "●" : "○"}</i></div><p>{surface.role}</p><div className="surface-card-action"><span>{surface.status === "not-configured" ? "等待本地配置" : surface.status === "disabled" ? "当前未启用" : "已配置"}</span><b>{surface.url ? "打开 ↗" : "—"}</b></div></>;
  if (surface.kind === "external" && surface.url) return <a className="surface-card" href={surface.url} target="_blank" rel="noreferrer">{content}</a>;
  return <button className="surface-card" type="button" disabled={!surface.url} onClick={onEmbeddedOpen}>{content}</button>;
}

function StageCard({ stage, surface, onOpenView, showConnector }: { stage: PipelineStage; surface: ControlSurface | undefined; onOpenView: (view: ViewId) => void; showConnector: boolean }) {
  const action = stage.surfaceId && surface?.url ? surface.kind === "external" ? <a href={surface.url} target="_blank" rel="noreferrer">打开画布 ↗</a> : <button type="button" onClick={() => onOpenView(stage.view ?? "overview")}>进入模块 →</button> : stage.view ? <button type="button" onClick={() => onOpenView(stage.view!)}>查看详情 →</button> : <span>自动执行</span>;
  return <div className="stage-card-wrap"><article className={`stage-card ${stage.state}`}><div className="stage-index">{stage.index}</div><span className="stage-owner">{stage.owner}</span><h3>{stage.title}</h3><p>{stage.description}</p><div className="stage-footer"><strong><i />{stateLabels[stage.state]}</strong>{action}</div></article>{showConnector && <div className="stage-connector">→</div>}</div>;
}

function StageRow({ stage, surface, onOpenView }: { stage: PipelineStage; surface: ControlSurface | undefined; onOpenView: (view: ViewId) => void }) {
  return <article className={`stage-row ${stage.state}`}><div className="stage-index">{stage.index}</div><div className="stage-row-copy"><span>{stage.owner}</span><h3>{stage.title}</h3><p>{stage.description}</p></div><div className="stage-row-status"><strong><i />{stateLabels[stage.state]}</strong><small>{surface ? surface.status === "not-configured" ? "需要在 .env.local 配置" : surface.kind === "external" ? "专业画布" : "Harness 内置" : "Harness 自动编排"}</small></div>{surface?.url ? surface.kind === "external" ? <a href={surface.url} target="_blank" rel="noreferrer">打开 {surface.name} ↗</a> : <button type="button" onClick={() => onOpenView(stage.view ?? "overview")}>进入模块 →</button> : <button type="button" disabled>尚未配置</button>}</article>;
}

function AssetLane({ label, count, children }: { label: string; count: number; children: React.ReactNode }) { return <section className="asset-lane"><div className="asset-lane-head"><strong>{label}</strong><span>{count}</span></div><div className="asset-grid">{children}{count === 0 && <div className="asset-empty">等待上游产物</div>}</div></section>; }
function AssetCard({ title, meta, url, mediaLabel = "VIDEO" }: { title: string; meta: string; url?: string | undefined; mediaLabel?: string }) { return <article className="asset-card"><div className="asset-thumb"><span>{mediaLabel}</span></div><strong>{title}</strong><small>{meta}</small>{url && <a href={url} target="_blank" rel="noreferrer">打开产物 ↗</a>}</article>; }

function buildStages(job: VideoJob | undefined, runtime: RuntimeInfo | undefined, candidates: Candidate[]): PipelineStage[] {
  const executions = candidates.flatMap((candidate) => candidate.executions ?? []);
  const hasComfy = executions.some((execution) => execution.executor === "comfyui-control");
  const comfyRunning = executions.some((execution) => execution.executor === "comfyui-control" && execution.status === "running");
  const comfyFailed = executions.some((execution) => execution.executor === "comfyui-control" && execution.status === "failed");
  const hasLibTv = executions.some((execution) => execution.executor === "libtv-generation");
  const libRunning = executions.some((execution) => execution.executor === "libtv-generation" && execution.status === "running");
  const libFailed = executions.some((execution) => execution.executor === "libtv-generation" && execution.status === "failed");
  const evaluated = candidates.some((candidate) => candidate.evaluation);
  const accepted = job?.shots.length ? job.shots.every((shot) => Boolean(shot.selectedCandidateId)) : false;
  const controlled = runtime?.generationPipeline === "comfyui-libtv";
  return [
    { id: "director", index: "01", owner: "CREATIVE DIRECTOR SKILL", title: "剧本与分镜规划", description: "拆解创作目标，建立角色、风格、镜头和验收约束。", state: !job ? "ready" : job.status === "planning" || job.status === "queued" ? "running" : job.plan ? "passed" : job.status === "failed" ? "attention" : "waiting", view: "pipeline" },
    { id: "h3", index: "02", owner: "COMFYUI · MINIMAX H3", title: "动作与镜头骨架", description: "通过批准的 Workflow Profile 控制人物、动作、运镜和节奏。", state: !controlled ? "disabled" : comfyFailed ? "attention" : comfyRunning ? "running" : hasComfy ? "passed" : job?.status === "generating" ? "ready" : "waiting", surfaceId: "comfyui", view: "pipeline" },
    { id: "libtv", index: "03", owner: "LIBTV ONLINE PROFILE", title: "在线精修与最终候选", description: "以上游控制资产为参考，生成高质量、可替换模型的最终镜头。", state: !controlled ? "disabled" : libFailed ? "attention" : libRunning ? "running" : hasLibTv ? "passed" : hasComfy ? "ready" : "waiting", surfaceId: "libtv", view: "pipeline" },
    { id: "quality", index: "04", owner: "QUALITY LOOP", title: "一致性评测与局部重试", description: "评估身份、动作、语义、时序和技术质量，并把问题送回责任阶段。", state: job?.status === "evaluating" ? "running" : accepted ? "passed" : evaluated ? "attention" : candidates.some((candidate) => candidate.status === "succeeded") ? "ready" : "waiting", view: "pipeline" },
    { id: "post", index: "05", owner: "HYPERFRAMES / LIBTV", title: "剪辑、字幕与确定性包装", description: "聚合合格镜头，完成标题、数据动效、转场和音频包装。", state: job?.status === "composing" ? "running" : job?.output ? "passed" : accepted ? "ready" : "waiting", surfaceId: "hyperframes", view: "post-production" },
    { id: "delivery", index: "06", owner: "IMS · QC · ARCHIVE", title: "4K 交付与归档", description: "输出母版、4K 超分、编码检查、签发、Manifest 和企业归档。", state: job?.status === "failed" && job.error ? "attention" : job?.status === "mastering" || job?.status === "upscaling" || job?.status === "persisting" ? "running" : job?.status === "completed" ? "passed" : job?.output ? "passed" : accepted ? "ready" : "waiting", surfaceId: "delivery", view: "delivery" },
  ];
}
