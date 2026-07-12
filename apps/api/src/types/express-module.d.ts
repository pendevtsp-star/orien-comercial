import type { IncomingHttpHeaders } from "node:http";

export interface Request {
  headers: IncomingHttpHeaders;
  method: string;
  path: string;
  url: string;
  ip?: string;
  cookies?: Record<string, string>;
  [key: string]: unknown;
}

export interface Response {
  statusCode: number;
  setHeader(name: string, value: number | string | readonly string[]): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
  status(code: number): this;
  json(body: unknown): this;
  type(type: string): this;
  send(body?: unknown): this;
  cookie(name: string, value: string, options?: Record<string, unknown>): this;
  clearCookie(name: string, options?: Record<string, unknown>): this;
  [key: string]: unknown;
}

export type NextFunction = (err?: unknown) => void;

