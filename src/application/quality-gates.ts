import type {
  EvaluationReport,
  EvaluationStage,
  QualityDimensions,
} from "../domain/execution-recipe.js";

export interface QualityGatePolicy {
  stage: EvaluationStage;
  minimumOverallScore: number;
  minimumBlockingDimensionScore: number;
  blockingDimensions: Array<keyof QualityDimensions>;
  advisoryDimensions: Array<keyof QualityDimensions>;
}

export type QualityGateOutcome = "pass" | "pass-with-warnings" | "fail";

export const qualityGatePolicies: Record<EvaluationStage, QualityGatePolicy> = {
  "control-draft": {
    stage: "control-draft",
    minimumOverallScore: 0.5,
    minimumBlockingDimensionScore: 0.45,
    blockingDimensions: ["motionQuality", "promptAlignment", "temporalStability", "technicalQuality"],
    advisoryDimensions: ["identityConsistency"],
  },
  "final-candidate": {
    stage: "final-candidate",
    minimumOverallScore: 0.8,
    minimumBlockingDimensionScore: 0.85,
    blockingDimensions: [
      "identityConsistency",
      "motionQuality",
      "promptAlignment",
      "temporalStability",
      "technicalQuality",
    ],
    advisoryDimensions: [],
  },
  delivery: {
    stage: "delivery",
    minimumOverallScore: 0.9,
    minimumBlockingDimensionScore: 0.95,
    blockingDimensions: ["technicalQuality"],
    advisoryDimensions: [
      "identityConsistency",
      "motionQuality",
      "promptAlignment",
      "temporalStability",
    ],
  },
};

export function evaluateQualityGate(
  report: EvaluationReport,
  policy: QualityGatePolicy = qualityGatePolicies[report.stage],
): QualityGateOutcome {
  if (report.stage !== policy.stage) {
    throw new Error(`Evaluation stage ${report.stage} does not match policy ${policy.stage}`);
  }
  const hasBlockingIssue = report.issues.some((issue) => issue.severity === "error");
  const failedDimension = policy.blockingDimensions.some(
    (dimension) => report.dimensions[dimension] < policy.minimumBlockingDimensionScore,
  );
  if (hasBlockingIssue || failedDimension || report.overallScore < policy.minimumOverallScore) {
    return "fail";
  }

  const hasAdvisoryFailure = policy.advisoryDimensions.some(
    (dimension) => report.dimensions[dimension] < policy.minimumBlockingDimensionScore,
  );
  const hasWarning = report.issues.some((issue) => issue.severity === "warning");
  return hasAdvisoryFailure || hasWarning ? "pass-with-warnings" : "pass";
}
