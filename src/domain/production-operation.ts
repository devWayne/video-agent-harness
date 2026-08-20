import { randomUUID } from "node:crypto";
import { z } from "zod";

export const productionOperationKindSchema = z.enum([
  "control-generation",
  "final-render",
  "assembly",
  "delivery",
]);

export const productionExecutorSchema = z.enum([
  "comfyui",
  "libtv",
  "online-video",
  "hyperframes",
  "delivery",
  "manual",
]);

export const operationStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const operationReviewStatusSchema = z.enum([
  "not-ready",
  "not-required",
  "pending",
  "accepted",
  "rejected",
  "human-review",
]);

export const operationReviewDecisionSchema = z.enum([
  "accept",
  "revise-control",
  "regenerate-final",
  "human-review",
]);

const evaluationIssueSchema = z.object({
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1_000),
  severity: z.enum(["info", "warning", "error"]),
});

export const createProductionOperationSchema = z.object({
  kind: productionOperationKindSchema,
  executor: productionExecutorSchema,
  shotId: z.string().trim().min(1).max(200).optional(),
  sceneId: z.string().trim().min(1).max(200).optional(),
  profileId: z.string().trim().min(1).max(240).optional(),
  prompt: z.string().trim().min(1).max(8_000).optional(),
  inputAssetIds: z.array(z.uuid()).max(30).default([]),
  dependsOnOperationIds: z.array(z.uuid()).max(30).default([]),
  parameters: z.record(z.string(), z.unknown()).default({}),
  requiresReview: z.boolean().default(true),
});

export const startProductionOperationSchema = z.object({
  providerTaskId: z.string().trim().min(1).max(500).optional(),
});

export const completeProductionOperationSchema = z.object({
  providerTaskId: z.string().trim().min(1).max(500).optional(),
  outputAssetIds: z.array(z.uuid()).min(1).max(30),
});

export const failProductionOperationSchema = z.object({
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2_000),
  retryable: z.boolean().default(true),
});

export const reviewProductionOperationSchema = z.object({
  gate: z.enum(["control-draft", "final-candidate", "delivery"]),
  decision: operationReviewDecisionSchema,
  overallScore: z.number().min(0).max(1),
  dimensions: z.record(z.string(), z.number().min(0).max(1)).default({}),
  issues: z.array(evaluationIssueSchema).max(100).default([]),
  evidence: z.array(z.object({
    assetId: z.uuid().optional(),
    timestampSeconds: z.number().min(0).optional(),
    description: z.string().trim().min(1).max(1_000),
  })).max(100).default([]),
  suggestedParameterPatch: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().trim().max(4_000).optional(),
  reviewedBy: z.object({
    type: z.enum(["agent", "human"]),
    name: z.string().trim().min(1).max(160),
  }),
});

export type ProductionOperationKind = z.infer<typeof productionOperationKindSchema>;
export type ProductionExecutor = z.infer<typeof productionExecutorSchema>;
export type OperationStatus = z.infer<typeof operationStatusSchema>;
export type OperationReviewStatus = z.infer<typeof operationReviewStatusSchema>;
export type OperationReviewDecision = z.infer<typeof operationReviewDecisionSchema>;
export type CreateProductionOperationInput = z.infer<typeof createProductionOperationSchema>;
export type StartProductionOperationInput = z.infer<typeof startProductionOperationSchema>;
export type CompleteProductionOperationInput = z.infer<typeof completeProductionOperationSchema>;
export type FailProductionOperationInput = z.infer<typeof failProductionOperationSchema>;
export type ReviewProductionOperationInput = z.infer<typeof reviewProductionOperationSchema>;

export interface ProductionOperationReview extends ReviewProductionOperationInput {
  at: string;
}

export interface ProductionOperation {
  id: string;
  kind: ProductionOperationKind;
  executor: ProductionExecutor;
  status: OperationStatus;
  reviewStatus: OperationReviewStatus;
  attempt: number;
  shotId?: string;
  sceneId?: string;
  profileId?: string;
  prompt?: string;
  inputAssetIds: string[];
  outputAssetIds: string[];
  dependsOnOperationIds: string[];
  parameters: Record<string, unknown>;
  requiresReview: boolean;
  providerTaskId?: string;
  review?: ProductionOperationReview;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export function createProductionOperation(
  input: CreateProductionOperationInput,
  now = new Date(),
): ProductionOperation {
  const timestamp = now.toISOString();
  return {
    id: randomUUID(),
    kind: input.kind,
    executor: input.executor,
    status: "queued",
    reviewStatus: input.requiresReview ? "not-ready" : "not-required",
    attempt: 0,
    inputAssetIds: input.inputAssetIds,
    outputAssetIds: [],
    dependsOnOperationIds: input.dependsOnOperationIds,
    parameters: input.parameters,
    requiresReview: input.requiresReview,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.shotId ? { shotId: input.shotId } : {}),
    ...(input.sceneId ? { sceneId: input.sceneId } : {}),
    ...(input.profileId ? { profileId: input.profileId } : {}),
    ...(input.prompt ? { prompt: input.prompt } : {}),
  };
}

export function startProductionOperation(
  operation: ProductionOperation,
  input: StartProductionOperationInput,
  now = new Date(),
): ProductionOperation {
  if (operation.status !== "queued" && operation.status !== "failed") {
    throw new ProductionOperationTransitionError(
      `Operation ${operation.id} cannot start from ${operation.status}`,
    );
  }
  return {
    ...operation,
    status: "running",
    attempt: operation.attempt + 1,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...(input.providerTaskId ? { providerTaskId: input.providerTaskId } : {}),
  };
}

export function completeProductionOperation(
  operation: ProductionOperation,
  input: CompleteProductionOperationInput,
  now = new Date(),
): ProductionOperation {
  if (operation.status !== "running") {
    throw new ProductionOperationTransitionError(
      `Operation ${operation.id} cannot complete from ${operation.status}`,
    );
  }
  return {
    ...operation,
    status: "succeeded",
    outputAssetIds: input.outputAssetIds,
    reviewStatus: operation.requiresReview ? "pending" : "not-required",
    completedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...(input.providerTaskId ? { providerTaskId: input.providerTaskId } : {}),
  };
}

export function failProductionOperation(
  operation: ProductionOperation,
  input: FailProductionOperationInput,
  now = new Date(),
): ProductionOperation {
  if (operation.status !== "running") {
    throw new ProductionOperationTransitionError(
      `Operation ${operation.id} cannot fail from ${operation.status}`,
    );
  }
  return {
    ...operation,
    status: "failed",
    error: input,
    completedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function reviewProductionOperation(
  operation: ProductionOperation,
  input: ReviewProductionOperationInput,
  now = new Date(),
): ProductionOperation {
  if (operation.status !== "succeeded" || !operation.requiresReview) {
    throw new ProductionOperationTransitionError(
      `Operation ${operation.id} is not waiting for review`,
    );
  }
  assertReviewMatchesOperation(operation.kind, input);
  const reviewStatus: OperationReviewStatus = input.decision === "accept"
    ? "accepted"
    : input.decision === "human-review"
      ? "human-review"
      : "rejected";
  return {
    ...operation,
    reviewStatus,
    review: { ...input, at: now.toISOString() },
    updatedAt: now.toISOString(),
  };
}

export function operationPassedGate(operation: ProductionOperation): boolean {
  return operation.status === "succeeded"
    && (operation.reviewStatus === "accepted" || operation.reviewStatus === "not-required");
}

export class ProductionOperationTransitionError extends Error {
  readonly code = "OPERATION_TRANSITION_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "ProductionOperationTransitionError";
  }
}

function assertReviewMatchesOperation(
  kind: ProductionOperationKind,
  input: ReviewProductionOperationInput,
): void {
  if (kind === "control-generation" && input.gate !== "control-draft") {
    throw new ProductionOperationTransitionError("Control generation must use the control-draft gate");
  }
  if (kind === "final-render" && input.gate !== "final-candidate") {
    throw new ProductionOperationTransitionError("Final render must use the final-candidate gate");
  }
  if ((kind === "assembly" || kind === "delivery") && input.gate !== "delivery") {
    throw new ProductionOperationTransitionError("Assembly and delivery must use the delivery gate");
  }
  if (kind === "control-generation" && input.decision === "regenerate-final") {
    throw new ProductionOperationTransitionError("A control draft cannot request final regeneration");
  }
  if (kind === "final-render" && input.decision === "revise-control") {
    return;
  }
  if ((kind === "assembly" || kind === "delivery") && input.decision !== "accept" && input.decision !== "human-review") {
    throw new ProductionOperationTransitionError("Delivery-stage review can only accept or request human review");
  }
}
