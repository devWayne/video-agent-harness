import type { WorkflowEngine } from "./workflow-engine.js";

export class WorkflowDispatcher {
  readonly #queue: string[] = [];
  readonly #queued = new Set<string>();
  #draining: Promise<void> | undefined;

  constructor(private readonly workflow: WorkflowEngine) {}

  enqueue(jobId: string): void {
    if (this.#queued.has(jobId)) return;
    this.#queued.add(jobId);
    this.#queue.push(jobId);
    this.#ensureDraining();
  }

  #ensureDraining(): void {
    this.#draining ??= this.#drain().finally(() => {
      this.#draining = undefined;
      if (this.#queue.length > 0) this.#ensureDraining();
    });
  }

  async waitForIdle(): Promise<void> {
    await this.#draining;
  }

  async #drain(): Promise<void> {
    while (this.#queue.length > 0) {
      const jobId = this.#queue.shift();
      if (!jobId) continue;
      try {
        await this.workflow.run(jobId);
      } finally {
        this.#queued.delete(jobId);
      }
    }
  }
}
