import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportError } from "./reporter";

describe("reporter.ts reportError", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("emits structured json log when NODE_ENV is production", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await reportError({
      message: "Server rendered 500 error",
      source: "server",
      path: "/catalog",
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const firstCall = consoleSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const loggedJson = JSON.parse(firstCall![0] as string);
    expect(loggedJson.telemetry).toBe("error");
    expect(loggedJson.message).toBe("Server rendered 500 error");
    expect(loggedJson.source).toBe("server");
    expect(loggedJson.timestamp).toBeDefined();
  });

  it("dispatches to Sentry endpoint when configured and forced in test", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    process.env.ERROR_MONITORING_FORCE = "1";
    process.env.ERROR_MONITORING_ENABLED = "true";
    process.env.SENTRY_DSN = "https://publickey@o123456.ingest.sentry.io/78910";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());

    await reportError({
      message: "Critical DB failure",
      source: "server",
      stack: "Error: Critical DB failure\n  at db.ts:10",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(String(url)).toContain("https://o123456.ingest.sentry.io/api/78910/store/");
    expect(String(url)).toContain("sentry_key=publickey");
    expect(init?.method).toBe("POST");

    const payload = JSON.parse(init?.body as string);
    expect(payload.message).toBe("Critical DB failure");
    expect(payload.exception.values[0].value).toBe("Critical DB failure");
  });

  it("fails silently and logs warning if remote dispatch throws", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.ERROR_MONITORING_ENABLED = "true";
    process.env.SENTRY_DSN = "https://publickey@o123456.ingest.sentry.io/78910";

    vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network timeout"));

    await expect(
      reportError({
        message: "Network test error",
      }),
    ).resolves.not.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
