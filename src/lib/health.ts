import { fail, ok } from "./api-response";

export interface HealthReport {
  status: "ok" | "degraded";
  database: "ok" | "unreachable";
}

export const HEALTH_TIMEOUT_MS = 3000;

/** Resolves when the database answered; anything else means unreachable. */
export type DatabaseProbe = () => Promise<unknown>;

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
  });
}

export async function checkHealth(
  probe: DatabaseProbe,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<HealthReport> {
  try {
    await Promise.race([probe(), timeout(timeoutMs)]);
    return { status: "ok", database: "ok" };
  } catch (error: unknown) {
    // Driver details stay in the server log; the response only says "unreachable".
    console.error("[health] database check failed:", error);
    return { status: "degraded", database: "unreachable" };
  }
}

export function healthResponse(report: HealthReport): Response {
  return report.database === "ok"
    ? ok(report)
    : fail("Không kết nối được cơ sở dữ liệu", 503, report);
}
