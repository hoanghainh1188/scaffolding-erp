import {
  photoStorageStatus,
  type PhotoStorageStatus,
} from "@/domain/return-photo";

import { fail, ok } from "./api-response";

export interface HealthReport {
  status: "ok" | "degraded";
  database: "ok" | "unreachable";
  /** Return photos above the warning threshold (0.2 #65); no figures. */
  photoStorage?: PhotoStorageStatus;
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

/**
 * Adds the photo storage status once the database answered. A failed sum
 * leaves the report as it was: the check is a warning, not a health state.
 */
export async function withPhotoStorage(
  report: HealthReport,
  totalBytes: () => Promise<number>,
): Promise<HealthReport> {
  if (report.database !== "ok") return report;
  try {
    return { ...report, photoStorage: photoStorageStatus(await totalBytes()) };
  } catch (error: unknown) {
    console.error("[health] photo storage check failed:", error);
    return report;
  }
}

export function healthResponse(report: HealthReport): Response {
  return report.database === "ok"
    ? ok(report)
    : fail("Không kết nối được cơ sở dữ liệu", 503, report);
}
