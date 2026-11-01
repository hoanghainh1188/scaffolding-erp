import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";
import { isSameOrigin } from "@/lib/auth/guard";
import { clientIp, consumeRateLimit } from "@/lib/auth/rate-limit";
import { reportError } from "@/lib/monitoring/reporter";
import { sanitizeErrorPayload } from "@/lib/monitoring/sanitize";

const MAX_PAYLOAD_BYTES = 32 * 1024; // 32KB limit
/** Reports per IP per minute; a page in an error loop stays well under. */
export const TELEMETRY_LIMIT_PER_WINDOW = 30;

/**
 * Endpoint for client-side telemetry and unhandled error reports.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // No withAuth: a report from a session that just expired still counts.
  // The proxy only looks for a cookie, so these two checks are what stop
  // other sites and scripts from flooding the logs and the Sentry quota.
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  try {
    const allowed = await consumeRateLimit(
      getDatabase(),
      `telemetry:${clientIp(request.headers)}`,
      new Date(),
      TELEMETRY_LIMIT_PER_WINDOW,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many error reports" },
        { status: 429 },
      );
    }

    const rawText = await request.text();
    if (!rawText || rawText.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: "Invalid error payload" },
        { status: 400 },
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { error: "Payload must be JSON" },
        { status: 400 },
      );
    }

    const message =
      typeof payload.message === "string" ? payload.message.trim() : "";
    if (!message) {
      return NextResponse.json(
        { error: "Missing error message" },
        { status: 400 },
      );
    }

    const sanitized = sanitizeErrorPayload({
      message,
      name: typeof payload.name === "string" ? payload.name : undefined,
      stack: typeof payload.stack === "string" ? payload.stack : undefined,
      url: typeof payload.url === "string" ? payload.url : undefined,
      source: "client" as const,
      context:
        payload.context && typeof payload.context === "object"
          ? (payload.context as Record<string, unknown>)
          : undefined,
    });

    await reportError(sanitized);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to process error report" },
      { status: 500 },
    );
  }
}
