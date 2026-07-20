import { Injectable, Logger } from "@nestjs/common";
import { OperationsFoundationService } from "./operations-foundation.service";

@Injectable()
export class OperationsFoundationWorker {
  private readonly logger = new Logger(OperationsFoundationWorker.name);
  private readonly workerId = process.env.WORKER_ID ?? `operations-${process.pid}`;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;
  private resolveStopped?: () => void;

  constructor(private readonly operations: OperationsFoundationService) {}

  start() {
    this.schedule();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
    this.resolveStopped?.();
  }

  waitForShutdown() {
    return new Promise<void>((resolve) => {
      this.resolveStopped = resolve;
    });
  }

  private schedule() {
    if (this.stopped) return;
    this.running = this.runOnce()
      .catch((error: unknown) => {
        this.logger.error("Operational worker iteration failed", error instanceof Error ? error.stack : error);
      })
      .finally(() => {
        if (!this.stopped) this.timer = setTimeout(() => this.schedule(), 1_000);
      });
  }

  private async runOnce() {
    const jobs = await this.operations.claimDueJobs(this.workerId, 10);
    for (const job of jobs) {
      try {
        await this.operations.executeInternalJob(job);
        await this.operations.completeJob(job, this.workerId);
      } catch (error) {
        await this.operations.failJob(job, this.workerId, error);
      }
    }
  }
}
