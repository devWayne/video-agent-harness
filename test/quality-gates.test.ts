import { describe, expect, it } from "vitest";
import { evaluateQualityGate } from "../src/application/quality-gates.js";
import type { EvaluationReport } from "../src/domain/execution-recipe.js";

describe("stage-specific quality gates", () => {
  it("keeps identity drift advisory for a usable control draft", () => {
    expect(evaluateQualityGate(report("control-draft"))).toBe("pass-with-warnings");
  });

  it("blocks the same identity drift on a final candidate", () => {
    expect(evaluateQualityGate(report("final-candidate"))).toBe("fail");
  });
});

function report(stage: EvaluationReport["stage"]): EvaluationReport {
  return {
    stage,
    evaluator: "test",
    overallScore: 0.76,
    dimensions: {
      identityConsistency: 0.35,
      motionQuality: 0.86,
      promptAlignment: 0.82,
      temporalStability: 0.75,
      technicalQuality: 0.9,
    },
    issues: [
      {
        code: "IDENTITY_DRIFT_AFTER_BACK_VIEW",
        message: "Face changes after the subject turns back toward camera.",
        severity: "warning",
        targetStepId: "control-pass",
      },
    ],
    decision: stage === "control-draft" ? "accept" : "regenerate-final",
    suggestedChanges: [],
    evaluatedAt: "2026-08-18T00:00:00.000Z",
  };
}
