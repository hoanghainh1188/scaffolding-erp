import { z } from "zod";

import { ROLES } from "@/domain/role";

/** Wrong or missing configuration. Server-only; never shown to end users. */
export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

const NODE_ENVS = ["development", "test", "production"] as const;
const POSTGRES_URL = /^postgres(ql)?:\/\/\S+$/;

// Empty values (`DATABASE_URL=` in a .env file) count as missing.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

const envSchema = z.object({
  NODE_ENV: optional(z.enum(NODE_ENVS).default("development")),
  DATABASE_URL: optional(
    z
      .string()
      .refine((value) => POSTGRES_URL.test(value) && URL.canParse(value)),
  ),
  DEV_ROLE: optional(z.enum(ROLES).default("DIRECTOR")),
});

export type Env = z.infer<typeof envSchema>;
type EnvKey = keyof Env;

// Messages name the variable and the rule, never the configured value:
// DATABASE_URL may carry a password.
const RULES: Readonly<Record<EnvKey, string>> = {
  NODE_ENV: `phải là một trong ${NODE_ENVS.join(", ")}`,
  DATABASE_URL: "phải là URL dạng postgres://user:password@host:port/database",
  DEV_ROLE: `phải là một trong ${ROLES.join(", ")}`,
};

export function parseEnv(
  source: Readonly<Record<string, string | undefined>>,
): Env {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }
  const keys = [
    ...new Set(result.error.issues.map((issue) => issue.path[0] as EnvKey)),
  ];
  const lines = keys.map((key) => {
    const missing = source[key] === undefined || source[key] === "";
    return `- ${key}: ${missing ? "thiếu biến này" : RULES[key]}`;
  });
  throw new ConfigError(`Cấu hình môi trường sai:\n${lines.join("\n")}`);
}

let cached: Env | undefined;

/** Validated process.env, parsed once per server process. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
