import "reflect-metadata";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { NextFunction, Request, Response } from "express";
import { loadConfig } from "@sgc/config";
import { AppModule } from "./modules/app.module";
import { CacheService } from "./modules/cache/cache.service";
import { DatabaseService } from "./modules/database/database.service";
import { HttpExceptionFilter } from "./shared/http-exception.filter";

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix("api/v1");
  const uploadDir = resolve(config.UPLOAD_DIR);
  mkdirSync(uploadDir, { recursive: true });
  app
    .getHttpAdapter()
    .getInstance()
    .use(
      "/uploads",
      (
        request: { path: string },
        response: { sendFile: (path: string, options: { root: string }) => void },
      ) => {
        response.sendFile(request.path, { root: uploadDir });
      },
    );
  app.use(helmet());
  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.use((request: Request & { requestId?: string }, response: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    const incoming = request.headers["x-request-id"];
    const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    response.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      console.log(
        JSON.stringify({
          type: "http_request",
          requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Number(durationMs.toFixed(1)),
        }),
      );
    });
    next();
  });
  app.enableCors({
    origin:
      config.NODE_ENV === "production"
        ? [config.WEB_APP_URL, config.ADMIN_APP_URL, config.MARKETING_APP_URL]
        : [
            config.WEB_APP_URL,
            config.ADMIN_APP_URL,
            config.MARKETING_APP_URL,
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3002",
          ],
    credentials: true,
  });
  app.getHttpAdapter().get("/health", async (_request: Request, response: Response) => {
    const [database, redis] = await Promise.all([
      app.get(DatabaseService).ping(),
      app.get(CacheService).ping(),
    ]);
    const healthy = database && redis;
    response.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      service: "orien-api",
      version: process.env.APP_VERSION ?? "development",
      uptimeSeconds: Math.floor(process.uptime()),
      dependencies: { database, redis },
    });
  });
  app.enableShutdownHooks();
  const database = app.get(DatabaseService);
  app.useGlobalFilters(
    new HttpExceptionFilter(async (event) => {
      await database.pool.query(
        `
        INSERT INTO platform_error_events
          (request_id, method, path, status_code, error_code, message, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          event.requestId,
          event.method,
          event.path,
          event.statusCode,
          event.errorCode,
          event.message.slice(0, 600),
          event.userAgent?.slice(0, 300) ?? null,
        ],
      );
    }),
  );

  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("SaaS Gestao Comercial API")
      .setDescription("API versionada para o SaaS multitenant de gestao comercial.")
      .setVersion("1.15.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = Number(process.env.API_PORT ?? 3333);
  await app.listen(port);
}

void bootstrap();

