import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";
import { OperationsFoundationWorker } from "./modules/operations-foundation/operations-foundation.worker";

async function bootstrap() {
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
  worker.start();
  await worker.waitForShutdown();
}

void bootstrap();
