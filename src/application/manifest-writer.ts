import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { VideoDeliveryState, VideoJob } from "../domain/video-job.js";
import { redactUrlSecrets } from "../security/url-redaction.js";

export class ManifestWriter {
  constructor(private readonly dataDirectory: string) {}

  async write(job: VideoJob, delivery: VideoDeliveryState): Promise<string> {
    const directory = join(this.dataDirectory, "jobs", job.id);
    await mkdir(directory, { recursive: true });
    const target = join(directory, "manifest.json");
    const temporary = `${target}.tmp`;
    const shots = job.shots.map((shot) => {
      const selected = shot.candidates.find(
        (candidate) => candidate.id === shot.selectedCandidateId,
      );
      if (!selected?.outputUrl) throw new Error(`Shot ${shot.id} has no selected output URL`);
      const stored = delivery.assets.find((asset) => asset.candidateId === selected.id);
      return {
        id: shot.id,
        index: shot.index,
        durationSeconds: shot.durationSeconds,
        prompt: shot.prompt,
        // Keep lineage without persisting provider query signatures.
        providerSourceUrl: redactUrlSecrets(selected.outputUrl),
        ...(selected.recipe ? { recipe: selected.recipe } : {}),
        ...(selected.executions ? { executions: selected.executions } : {}),
        ...(selected.evaluation ? { evaluation: selected.evaluation } : {}),
        ...(stored ? { storedAsset: stored } : {}),
      };
    });

    await writeFile(
      temporary,
      `${JSON.stringify(
        {
          schemaVersion: 3,
          jobId: job.id,
          canvas: { width: 3840, height: 2160, aspectRatio: "16:9" },
          delivery,
          shots,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporary, target);
    return pathToFileURL(target).href;
  }
}
