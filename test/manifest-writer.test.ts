import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ManifestWriter } from "../src/application/manifest-writer.js";
import type { VideoJob } from "../src/domain/video-job.js";

describe("ManifestWriter", () => {
  it("never persists provider URL credentials or query signatures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "video-agent-manifest-"));
    const job: VideoJob = {
      id: "job-secret-redaction",
      request: {
        brief: "签名脱敏测试",
        durationSeconds: 5,
        aspectRatio: "16:9",
        outputResolution: "3840x2160",
        references: [],
      },
      status: "evaluating",
      version: 1,
      createdAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
      shots: [
        {
          id: "shot-01",
          index: 0,
          prompt: "测试镜头",
          durationSeconds: 5,
          status: "completed",
          selectedCandidateId: "candidate-1",
          candidates: [
            {
              id: "candidate-1",
              provider: "wan",
              providerTaskId: "wan-1",
              status: "succeeded",
              outputUrl:
                "https://user:password@provider.oss-cn-beijing.aliyuncs.com/result.mp4?Signature=secret#fragment",
            },
          ],
        },
      ],
    };

    try {
      const manifestUrl = await new ManifestWriter(directory).write(job, {
        mode: "simulation",
        assets: [],
      });
      const content = await readFile(fileURLToPath(manifestUrl), "utf8");
      expect(content).toContain("https://provider.oss-cn-beijing.aliyuncs.com/result.mp4");
      expect(content).not.toContain("Signature=secret");
      expect(content).not.toContain("password");
      expect(content).not.toContain("fragment");
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
