import { z } from "zod";

/** Wrong or missing configuration. Server-only; never shown to end users. */
export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

const NODE_ENVS = ["development", "test", "production"] as const;
const POSTGRES_URL = /^postgres(ql)?:\/\/\S+$/;
const HTTP_URL = /^https?:\/\/\S+$/;
const MIN_SECRET_LENGTH = 32;
const MIN_SEED_PASSWORD_LENGTH = 8;
const DEFAULT_AUTH_URL = "http://localhost:3000";

// Empty values (`DATABASE_URL=` in a .env file) count as missing.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

const booleanSchema = z.preprocess((val) => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const lower = val.trim().toLowerCase();
    if (["true", "1", "yes"].includes(lower)) return true;
    if (["false", "0", "no"].includes(lower)) return false;
  }
  return val;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: optional(z.enum(NODE_ENVS).default("development")),
  DATABASE_URL: optional(
    z
      .string()
      .refine((value) => POSTGRES_URL.test(value) && URL.canParse(value)),
  ),
  BETTER_AUTH_SECRET: optional(z.string().min(MIN_SECRET_LENGTH)),
  BETTER_AUTH_URL: optional(
    z
      .string()
      .refine((value) => HTTP_URL.test(value) && URL.canParse(value))
      .optional(),
  ),
  DEV_SEED_PASSWORD: optional(
    z.string().min(MIN_SEED_PASSWORD_LENGTH).optional(),
  ),
  E2E_PASSWORD: optional(z.string().min(MIN_SEED_PASSWORD_LENGTH).optional()),
  // Sign-in attempts per IP per minute (design D3). Only the E2E server,
  // where every browser shares localhost, raises it.
  AUTH_SIGN_IN_LIMIT_PER_MINUTE: optional(
    z.coerce.number().int().positive().default(20),
  ),
  // Database connection pool and timeouts for serverless / Neon (spec K8).
  DB_POOL_MAX: optional(z.coerce.number().int().positive().default(10)),
  DB_IDLE_TIMEOUT_SECONDS: optional(
    z.coerce.number().int().nonnegative().optional(),
  ),
  DB_CONNECT_TIMEOUT_SECONDS: optional(
    z.coerce.number().int().positive().default(3),
  ),
  DB_PREPARE: optional(booleanSchema.default(true)),
  // Public demonstration mode for internet trial deployments (spec K9).
  DEMO_MODE: optional(booleanSchema.default(false)),
  // Production unhandled error telemetry and monitoring (spec K11).
  SENTRY_DSN: optional(
    z
      .string()
      .refine((value) => HTTP_URL.test(value) && URL.canParse(value))
      .optional(),
  ),
  ERROR_MONITORING_ENABLED: optional(booleanSchema.optional()),
});

type ParsedEnv = z.infer<typeof envSchema>;
export type Env = Omit<ParsedEnv, "BETTER_AUTH_URL"> & {
  BETTER_AUTH_URL: string;
};

// Messages name the variable and the rule, never the configured value:
// DATABASE_URL may carry a password.
const RULES: Readonly<Record<EnvKey, string>> = {
  NODE_ENV: `phải là một trong ${NODE_ENVS.join(", ")}`,
  DATABASE_URL: "phải là URL dạng postgres://user:password@host:port/database",
  BETTER_AUTH_SECRET: `phải dài ít nhất ${MIN_SECRET_LENGTH} ký tự (tạo bằng: openssl rand -base64 32)`,
  BETTER_AUTH_URL: "phải là URL dạng https://ten-mien (bắt buộc ở production)",
  DEV_SEED_PASSWORD: `phải dài ít nhất ${MIN_SEED_PASSWORD_LENGTH} ký tự`,
  E2E_PASSWORD: `phải dài ít nhất ${MIN_SEED_PASSWORD_LENGTH} ký tự`,
  AUTH_SIGN_IN_LIMIT_PER_MINUTE: "phải là số nguyên dương",
  DB_POOL_MAX: "phải là số nguyên dương",
  DB_IDLE_TIMEOUT_SECONDS: "phải là số nguyên không âm",
  DB_CONNECT_TIMEOUT_SECONDS: "phải là số nguyên dương",
  DB_PREPARE: "phải là boolean (true hoặc false)",
  DEMO_MODE: "phải là boolean (true hoặc false)",
  SENTRY_DSN: "phải là URL dạng https://xxx@host/id",
  ERROR_MONITORING_ENABLED: "phải là boolean (true hoặc false)",
};

type EnvKey = keyof ParsedEnv;

export function parseEnv(
  source: Readonly<Record<string, string | undefined>>,
): Env {
  const result = envSchema.safeParse(source);
  const keys = result.success
    ? []
    : [...new Set(result.error.issues.map((issue) => issue.path[0] as EnvKey))];
  // In Vercel Preview deployments, derive BETTER_AUTH_URL from VERCEL_URL if not set.
  let authUrl = result.success ? result.data.BETTER_AUTH_URL : undefined;
  if (!authUrl && source.VERCEL_ENV === "preview" && source.VERCEL_URL) {
    authUrl = `https://${source.VERCEL_URL}`;
  }
  // The auth URL has a local default, but production must name its own.
  if (result.success && !authUrl && result.data.NODE_ENV === "production") {
    keys.push("BETTER_AUTH_URL");
  }
  // The owner URL runs migrations only; on the app server it would undo the
  // least-privilege app role (db-least-privilege D1).
  const ownerUrlOnServer =
    result.success &&
    result.data.NODE_ENV === "production" &&
    Boolean(source.DATABASE_URL_MIGRATE);
  if (result.success && keys.length === 0 && !ownerUrlOnServer) {
    return { ...result.data, BETTER_AUTH_URL: authUrl ?? DEFAULT_AUTH_URL };
  }
  const lines = keys.map((key) => {
    const missing = source[key] === undefined || source[key] === "";
    return `- ${key}: ${missing ? "thiếu biến này" : RULES[key]}`;
  });
  if (ownerUrlOnServer) {
    lines.push(
      "- DATABASE_URL_MIGRATE: không được đặt trên server app (chỉ dùng khi chạy migration)",
    );
  }
  throw new ConfigError(`Cấu hình môi trường sai:\n${lines.join("\n")}`);
}

let cached: Env | undefined;

/** Validated process.env, parsed once per server process. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Whether the app runs in public demonstration mode (spec K9). */
export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE !== undefined) {
    const raw = process.env.DEMO_MODE.trim().toLowerCase();
    return ["true", "1", "yes"].includes(raw);
  }
  try {
    return getEnv().DEMO_MODE;
  } catch {
    return false;
  }
}
