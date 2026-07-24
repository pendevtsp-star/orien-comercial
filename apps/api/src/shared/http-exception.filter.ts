import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";
import { captureApiException } from "./sentry";

export interface ApiErrorEvent {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  errorCode: string;
  message: string;
  userAgent?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly recordError?: (event: ApiErrorEvent) => Promise<void>) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const response = ctx.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException
        ? normalizeMessage(exception.getResponse())
        : "Ocorreu um erro inesperado.";
    const requestId = typeof request.requestId === "string" ? request.requestId : readRequestId(request);
    const errorCode = exception instanceof HttpException ? exception.name : "InternalServerError";

    if (!(exception instanceof HttpException)) {
      const errorMessage = exception instanceof Error ? exception.message : "Unknown error";
      console.error(`[${requestId}] Unhandled API error on ${request.method} ${request.url}:`, errorMessage);
    }

    if (status >= 500) {
      captureApiException(exception, {
        requestId,
        method: request.method,
        path: requestPath(request),
        statusCode: status,
      });
      void this.recordError?.({
        requestId,
        method: request.method,
        path: requestPath(request),
        statusCode: status,
        errorCode,
        message: Array.isArray(message) ? message.map(String).join("; ") : message,
        userAgent: readHeader(request.headers["user-agent"]),
      }).catch(() => undefined);
    }

    response.setHeader("x-request-id", requestId);
    response.status(status).json({
      statusCode: status,
      error: errorCode,
      message,
      requestId,
      timestamp: new Date().toISOString()
    });
  }
}

function normalizeMessage(payload: string | object): string | string[] {
  if (typeof payload === "string") return payload;
  if ("message" in payload) {
    const message = payload.message;
    if (typeof message === "string" || Array.isArray(message)) return message;
  }
  return "Requisicao invalida.";
}

function readRequestId(request: Request): string {
  const header = request.headers["x-request-id"];
  return Array.isArray(header) ? header[0] ?? "unknown-request" : header ?? "unknown-request";
}

function requestPath(request: Request): string {
  return typeof request.originalUrl === "string"
    ? request.originalUrl
    : typeof request.url === "string"
      ? request.url
      : "/";
}

function readHeader(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}
