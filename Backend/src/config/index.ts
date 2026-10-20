import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  MONITOR_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  THRESHOLD_WARNING_MS: z.coerce.number().int().positive().default(3000),
  THRESHOLD_CRITICAL_MS: z.coerce.number().int().positive().default(5000),
  EMPTY_RESULT_ALLOWED_APIS: z.string().default("HealthCheckAPI,StatusAPI"),
  MAX_BATCH_SIZE: z.coerce.number().int().positive().default(50),
  MAX_BODY_SIZE_BYTES: z.coerce.number().int().positive().default(262_144),
  // OPENAI_API_KEY: z.string().optional().default(""),
  //OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  // rename/add in the Zod env schema:
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),

  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  AI_MAX_CONCURRENT: z.coerce.number().int().positive().default(2),
  AI_MAX_CALLS_PER_BATCH: z.coerce.number().int().positive().default(10),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;
  logLevel: string;
  databaseUrl: string;
  corsOrigins: string[];
  rateLimit: { max: number; windowMs: number; monitorMax: number };
  thresholds: {
    warningMs: number;
    criticalMs: number;
    emptyResultAllowedApis: Set<string>;
  };
  limits: { maxBatchSize: number; maxBodySizeBytes: number };
  ai: {
    apiKey: string;
    model: string;
    timeoutMs: number;
    maxConcurrent: number;
    maxCallsPerBatch: number;
  };
};

function parseConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;
  if (e.THRESHOLD_CRITICAL_MS <= e.THRESHOLD_WARNING_MS) {
    throw new Error("THRESHOLD_CRITICAL_MS must be greater than THRESHOLD_WARNING_MS");
  }
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    corsOrigins: e.CORS_ORIGIN.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    rateLimit: {
      max: e.RATE_LIMIT_MAX,
      windowMs: e.RATE_LIMIT_WINDOW_MS,
      monitorMax: e.MONITOR_RATE_LIMIT_MAX,
    },
    thresholds: {
      warningMs: e.THRESHOLD_WARNING_MS,
      criticalMs: e.THRESHOLD_CRITICAL_MS,
      emptyResultAllowedApis: new Set(
        e.EMPTY_RESULT_ALLOWED_APIS.split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      ),
    },
    limits: {
      maxBatchSize: e.MAX_BATCH_SIZE,
      maxBodySizeBytes: e.MAX_BODY_SIZE_BYTES,
    },
    ai: {
      apiKey: e.GEMINI_API_KEY,
      model: e.GEMINI_MODEL,
      timeoutMs: e.AI_TIMEOUT_MS,
      maxConcurrent: e.AI_MAX_CONCURRENT,
      maxCallsPerBatch: e.AI_MAX_CALLS_PER_BATCH,
    },
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return parseConfig(env);
}

export const config: AppConfig = parseConfig();
