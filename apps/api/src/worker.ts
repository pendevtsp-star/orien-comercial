import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";
import { OperationsFoundationWorker } from "./modules/operations-foundation/operations-foundation.worker";
import { loadConfig } from "@sgc/config";
import { captureWorkerException, initializeSentry } from "./shared/sentry";

async function bootstrap() {
  initializeSentry(loadConfig());
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  const worker = app.get(OperationsFoundationWorker);
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await worker.stop();
    await app.close();
  };

  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
  try {
    worker.start();
    await worker.waitForShutdown();
  } catch (error) {
    captureWorkerException(error);
    throw error;
  }
}

void bootstrap();
