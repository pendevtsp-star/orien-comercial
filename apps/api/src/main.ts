import "reflect-metadata";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { loadConfig } from "@sgc/config";
import { AppModule } from "./modules/app.module";
import { HttpExceptionFilter } from "./shared/http-exception.filter";

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.use((request: Request & { requestId?: string }, response: Response, next: NextFunction) => {
    const incoming = request.headers["x-request-id"];
    const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  });
  app.enableCors({
    origin:
      config.NODE_ENV === "production"
        ? [config.WEB_APP_URL]
        : [config.WEB_APP_URL, "http://localhost:3000", "http://localhost:3001"],
    credentials: true
  });
  app.getHttpAdapter().get("/health", (_request: Request, response: Response) => {
    response.status(200).json({ status: "ok" });
  });
  app.useGlobalFilters(new HttpExceptionFilter());

  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("SaaS Gestao Comercial API")
      .setDescription("API versionada para o SaaS multitenant de gestao comercial.")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = Number(process.env.API_PORT ?? 3333);
  await app.listen(port);
}

void bootstrap();
