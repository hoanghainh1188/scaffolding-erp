import { reportError } from "@/lib/monitoring/reporter";

// Runs once when a server instance starts: stop right away on bad config.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@/lib/env");
    getEnv();
  }
}

export type RequestErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
  renderSource?: string;
  revalidateReason?: string;
};

export type RequestErrorRequest = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

/**
 * Global Next.js server error handler hook (Next.js 15+).
 * Automatically captures unhandled exceptions thrown during rendering,
 * route handlers, and server actions.
 */
export async function onRequestError(
  err: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext,
): Promise<void> {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown server error";
  const name = err instanceof Error ? err.name : undefined;
  const stack = err instanceof Error ? err.stack : undefined;
  const digest =
    err && typeof err === "object" && "digest" in err
      ? String((err as { digest?: unknown }).digest)
      : undefined;

  await reportError({
    message,
    name,
    stack,
    digest,
    source: "server",
    path: request.path,
    method: request.method,
    headers: request.headers as Record<string, unknown>,
    context: {
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    },
  });
}
