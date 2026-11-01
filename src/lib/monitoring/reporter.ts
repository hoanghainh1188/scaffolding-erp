import { sanitizeErrorPayload } from "./sanitize";

export interface ErrorReport {
  message: string;
  name?: string;
  stack?: string;
  digest?: string;
  source?: "server" | "client";
  url?: string;
  path?: string;
  method?: string;
  headers?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timestamp?: string;
}

/**
 * Dispatches an error report to external sinks (Sentry / webhook) and stdout structured log.
 * Payloads are strictly sanitized beforehand to prevent PII / credential leaks.
 */
export async function reportError(report: ErrorReport): Promise<void> {
  const sanitized = sanitizeErrorPayload({
    ...report,
    timestamp: report.timestamp ?? new Date().toISOString(),
  });

  // Emit structured log in production (and when debug enabled) for log drain / observability
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ERROR_MONITORING_DEBUG === "1"
  ) {
    console.error(JSON.stringify({ telemetry: "error", ...sanitized }));
  }

  const dsn = process.env.SENTRY_DSN;
  const isEnabled =
    process.env.ERROR_MONITORING_ENABLED === "true" ||
    (process.env.NODE_ENV === "production" &&
      Boolean(dsn) &&
      process.env.ERROR_MONITORING_ENABLED !== "false");

  // In test environment, do not attempt remote network dispatches unless explicitly forced
  if (
    !isEnabled ||
    !dsn ||
    (process.env.NODE_ENV === "test" &&
      process.env.ERROR_MONITORING_FORCE !== "1")
  ) {
    return;
  }

  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replace(/^\//, "");
    const publicKey = parsed.username;
    if (!projectId || !publicKey) return;

    const endpoint = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/?sentry_version=7&sentry_client=scaffolding-erp/0.1.0&sentry_key=${publicKey}`;

    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_id: crypto.randomUUID().replace(/-/g, ""),
        timestamp: new Date().toISOString(),
        platform: "javascript",
        level: "error",
        message: sanitized.message,
        exception: {
          values: [
            {
              type: sanitized.name ?? "Error",
              value: sanitized.message,
              stacktrace: sanitized.stack ? { frames: [] } : undefined,
            },
          ],
        },
        tags: {
          source: sanitized.source ?? "server",
        },
        extra: sanitized,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    // Silently handle transport failures to protect user requests
    if (process.env.NODE_ENV !== "test") {
      console.warn("Failed to dispatch error telemetry:", err);
    }
  }
}
