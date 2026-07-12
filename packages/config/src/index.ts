import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.string().default("local"),
  API_PORT: z.coerce.number().int().positive().default(3334),
  DATABASE_URL: z.string().url(),
  DATABASE_MIGRATION_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  PASSWORD_PEPPER: z.string().min(16),
  PLATFORM_OWNER_EMAIL: z.string().email().default("admin@example.com"),
  PLATFORM_OWNER_PASSWORD: z.string().min(8).default("ChangeMe123!DoNotUseInProduction"),
  UPLOAD_DIR: z.string().default("/app/uploads"),
  INTEGRATIONS_ENCRYPTION_KEY: z
    .string()
    .min(32)
    .default("replace-this-development-integration-key-32"),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_NAME: z.string().default("Orien"),
  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_APP_URL: z.string().url().default("http://localhost:3002"),
  MARKETING_APP_URL: z.string().url().default("http://localhost:3001"),
  ASAAS_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  ASAAS_API_URL: z.string().url().default("https://api-sandbox.asaas.com/v3"),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ALERT_FROM_EMAIL: z.string().email().default("alertas@useorien.com.br"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${formatted}`);
  }

  return parsed.data;
}

export function isProduction(config: Pick<AppConfig, "NODE_ENV">): boolean {
  return config.NODE_ENV === "production";
}
