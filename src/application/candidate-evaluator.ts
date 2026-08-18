import type { EvaluationReport } from "../domain/execution-recipe.js";
import type { VideoShot } from "../domain/video-job.js";

export interface CandidateEvaluationResult {
  selectedCandidateId: string;
  reports: Record<string, EvaluationReport>;
}

export interface CandidateEvaluator {
  evaluate(shot: VideoShot): Promise<CandidateEvaluationResult>;
}

export class FirstSuccessfulCandidateEvaluator implements CandidateEvaluator {
  async evaluate(shot: VideoShot): Promise<CandidateEvaluationResult> {
    const candidate = shot.candidates.find((item) => item.status === "succeeded" && item.outputUrl);
    if (!candidate) throw new Error(`Shot ${shot.id} has no successful candidate`);
    return {
      selectedCandidateId: candidate.id,
      reports: {
        [candidate.id]: {
          stage: "final-candidate",
          evaluator: "first-successful-baseline",
          overallScore: 1,
          dimensions: {
            identityConsistency: 1,
            motionQuality: 1,
            promptAlignment: 1,
            temporalStability: 1,
            technicalQuality: 1,
          },
          issues: [],
          decision: "accept",
          suggestedChanges: [],
          evaluatedAt: new Date().toISOString(),
        },
      },
    };
  }
}
