import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { VideoJob, VideoJobOutput } from "../domain/video-job.js";

export interface Composer {
  compose(job: VideoJob): Promise<VideoJobOutput>;
}

export class ManifestComposer implements Composer {
  constructor(private readonly dataDirectory: string) {}

  async compose(job: VideoJob): Promise<VideoJobOutput> {
    const directory = join(this.dataDirectory, "jobs", job.id);
    await mkdir(directory, { recursive: true });
    const target = join(directory, "manifest.json");
    const temporary = `${target}.tmp`;
    const shots = job.shots.map((shot) => {
      const selected = shot.candidates.find(
        (candidate) => candidate.id === shot.selectedCandidateId,
      );
      if (!selected?.outputUrl) throw new Error(`Shot ${shot.id} has no selected output URL`);
      return {
        id: shot.id,
        index: shot.index,
        durationSeconds: shot.durationSeconds,
        prompt: shot.prompt,
        sourceUrl: selected.outputUrl,
      };
    });

    await writeFile(
      temporary,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          jobId: job.id,
          canvas: { width: 3840, height: 2160, aspectRatio: "16:9" },
          shots,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporary, target);

    return {
      manifestUrl: pathToFileURL(target).href,
      width: 3840,
      height: 2160,
    };
  }
}
