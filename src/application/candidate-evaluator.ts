import type { VideoShot } from "../domain/video-job.js";

export interface CandidateEvaluator {
  select(shot: VideoShot): Promise<string>;
}

export class FirstSuccessfulCandidateEvaluator implements CandidateEvaluator {
  async select(shot: VideoShot): Promise<string> {
    const candidate = shot.candidates.find((item) => item.status === "succeeded" && item.outputUrl);
    if (!candidate) throw new Error(`Shot ${shot.id} has no successful candidate`);
    return candidate.id;
  }
}
