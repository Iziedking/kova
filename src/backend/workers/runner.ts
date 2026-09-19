import type { GameJobKind, GameJobRepository, LeasedGameJob } from "./job-repository";

export type JobHandler = (job: LeasedGameJob, signal: AbortSignal) => Promise<void>;

export class GameWorker {
  private stopped = false;

  constructor(private readonly input: { repository: GameJobRepository; workerId: string; handlers: Readonly<Partial<Record<GameJobKind, JobHandler>>>; leaseMs?: number; retryDelayMs?: number }) {}

  stop(): void {
    this.stopped = true;
  }

  async runOne(now = new Date(), signal = new AbortController().signal): Promise<"idle" | "completed" | "failed" | "stopped"> {
    if (this.stopped || signal.aborted) return "stopped";
    const job = await this.input.repository.leaseNext({ workerId: this.input.workerId, now, leaseMs: this.input.leaseMs ?? 30_000 });
    if (!job) return "idle";
    const handler = this.input.handlers[job.kind];
    if (!handler) {
      await this.input.repository.fail(job, "HANDLER_UNAVAILABLE", new Date(now.getTime() + (this.input.retryDelayMs ?? 5_000)), now);
      return "failed";
    }
    try {
      await handler(job, signal);
      if (!await this.input.repository.complete(job, new Date())) throw new Error("JOB_FENCE_LOST");
      return "completed";
    } catch (error) {
      await this.input.repository.fail(job, error instanceof Error ? error.message : "JOB_FAILED", new Date(Date.now() + (this.input.retryDelayMs ?? 5_000)), new Date());
      return "failed";
    }
  }
}

