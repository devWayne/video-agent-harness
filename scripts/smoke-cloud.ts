import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { loadConfig } from "../src/config.js";
import { createRuntime } from "../src/runtime.js";

loadEnv({ path: ".env.local", quiet: true });

const smokeEnvironment = z
  .object({
    CLOUD_SMOKE_BRIEF: z
      .string()
      .min(3)
      .default("金色日出下的现代城市天际线，电影感广角镜头缓慢推进，光影自然，画面连贯"),
    CLOUD_SMOKE_DURATION_SECONDS: z.coerce.number().int().min(5).max(15).default(5),
    CLOUD_SMOKE_DATA_DIR: z.string().min(1).default(".data/cloud-smoke"),
    CLOUD_SMOKE_IDEMPOTENCY_KEY: z.string().min(1).optional(),
  })
  .parse(process.env);

const config = loadConfig({
  ...process.env,
  NODE_ENV: "production",
  VIDEO_PROVIDER: "bailian",
  DELIVERY_MODE: "cloud",
  UPSCALE_PROVIDER: "aliyun-ims",
  SHOT_CANDIDATES: "1",
  DATA_DIR: smokeEnvironment.CLOUD_SMOKE_DATA_DIR,
});
const runtime = createRuntime(config);
const idempotencyKey =
  smokeEnvironment.CLOUD_SMOKE_IDEMPOTENCY_KEY ?? `cloud-acceptance-${Date.now()}`;

try {
  await runtime.service.resumePending();
  const created = await runtime.service.create({
    brief: smokeEnvironment.CLOUD_SMOKE_BRIEF,
    durationSeconds: smokeEnvironment.CLOUD_SMOKE_DURATION_SECONDS,
    idempotencyKey,
  });
  console.log(`Cloud acceptance job queued: ${created.id}`);
  console.log("Preflight order: OSS/IMS identity -> Wan 1080P -> OSS -> IMS master -> IMS SR5 4K");

  await runtime.dispatcher.waitForIdle();
  const completed = await runtime.service.get(created.id);
  if (!completed) throw new Error("Cloud acceptance job disappeared from the repository");
  if (completed.status !== "completed" || !completed.output) {
    throw new Error(
      `Cloud acceptance failed at ${completed.error?.stage ?? completed.status}: ${completed.error?.code ?? "UNKNOWN"}: ${completed.error?.message ?? "no provider message"}`,
    );
  }
  if (
    completed.output.deliveryMode !== "cloud" ||
    completed.output.width !== 3840 ||
    completed.output.height !== 2160 ||
    !completed.output.videoUrl ||
    !completed.output.storageUri ||
    !completed.output.masterVideoUrl
  ) {
    throw new Error("Cloud acceptance completed without the required 1080P master and 4K output contract");
  }

  const upscaleTask = completed.delivery?.upscaleTask;
  if (upscaleTask?.width !== 3840 || upscaleTask.height !== 2160) {
    throw new Error(
      `IMS did not report a verified 3840x2160 output (reported ${upscaleTask?.width ?? "unknown"}x${upscaleTask?.height ?? "unknown"})`,
    );
  }

  const manifestContent = await readFile(fileURLToPath(completed.output.manifestUrl), "utf8");
  if (/[?&](?:Signature|Expires|OSSAccessKeyId|x-oss-signature)=/i.test(manifestContent)) {
    throw new Error("Acceptance manifest contains a provider or OSS query signature");
  }

  const anonymousResponse = await fetch(completed.output.videoUrl, {
    method: "HEAD",
    redirect: "manual",
  });
  if (anonymousResponse.status !== 403) {
    throw new Error(`Private 4K object returned anonymous HTTP ${anonymousResponse.status}, expected 403`);
  }

  const signed = await runtime.service.createDownloadUrl(completed.id, 300);
  if (!signed) throw new Error("Cloud acceptance could not create a signed delivery URL");
  const signedResponse = await fetch(signed.url, {
    headers: { Range: "bytes=0-0" },
    redirect: "error",
  });
  if (signedResponse.status !== 200 && signedResponse.status !== 206) {
    throw new Error(`Signed 4K range request returned HTTP ${signedResponse.status}`);
  }
  await signedResponse.body?.cancel();

  const report = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    jobId: completed.id,
    status: completed.status,
    deliveryMode: completed.output.deliveryMode,
    width: upscaleTask.width,
    height: upscaleTask.height,
    storageUri: completed.output.storageUri,
    masterHost: safeHost(completed.output.masterVideoUrl),
    deliveryHost: safeHost(completed.output.videoUrl),
    anonymousHttpStatus: anonymousResponse.status,
    signedRangeHttpStatus: signedResponse.status,
    signedUrlExpiresAt: signed.expiresAt,
    eventCount: completed.events?.length ?? 0,
    providerTasks: {
      wan: completed.shots.flatMap((shot) =>
        shot.candidates.map((candidate) => candidate.providerTaskId),
      ),
      mastering: completed.delivery?.masterTask?.taskId,
      upscale: upscaleTask.taskId,
    },
  };
  const reportPath = join(config.DATA_DIR, "cloud-acceptance.json");
  await mkdir(config.DATA_DIR, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(`Cloud acceptance succeeded: ${completed.id}`);
  console.log(`Verified IMS output: ${report.width}x${report.height}`);
  console.log(`Private delivery: anonymous ${report.anonymousHttpStatus}, signed range ${report.signedRangeHttpStatus}`);
  console.log(`Non-secret acceptance report: ${reportPath}`);
} finally {
  await runtime.dispatcher.waitForIdle();
  runtime.repository.close();
}

function safeHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "non-http-output";
  }
}
