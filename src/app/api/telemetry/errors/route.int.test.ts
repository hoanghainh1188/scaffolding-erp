import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, TELEMETRY_LIMIT_PER_WINDOW } from "./route";
import * as reporterModule from "@/lib/monitoring/reporter";
import {
  TEST_BASE_URL,
  createTestContext,
  installTestContext,
  resetAuthTables,
} from "@/test/auth";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);

afterAll(async () => {
  uninstall();
  await ctx.close();
});

beforeEach(() => resetAuthTables(ctx));

function telemetryRequest(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${TEST_BASE_URL}/api/telemetry/errors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: TEST_BASE_URL,
      "x-forwarded-for": "203.0.113.50",
      ...headers,
    },
    body,
  });
}

describe("POST /api/telemetry/errors", () => {
  it("accepts valid error report and returns 200", async () => {
    const reportSpy = vi
      .spyOn(reporterModule, "reportError")
      .mockResolvedValue(undefined);

    const request = new Request("http://localhost:3000/api/telemetry/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: TEST_BASE_URL },
      body: JSON.stringify({
        message: "Uncaught TypeError: Cannot read properties of undefined",
        name: "TypeError",
        stack: "TypeError: Cannot read properties...\n at Component",
        url: "http://localhost:3000/inventory",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);

    expect(reportSpy).toHaveBeenCalledTimes(1);
    const call1 = reportSpy.mock.calls[0];
    expect(call1).toBeDefined();
    const callArg = call1![0];
    expect(callArg.message).toBe(
      "Uncaught TypeError: Cannot read properties of undefined",
    );
    expect(callArg.name).toBe("TypeError");
    expect(callArg.source).toBe("client");

    reportSpy.mockRestore();
  });

  it("sanitizes sensitive fields in client error context before reporting", async () => {
    const reportSpy = vi
      .spyOn(reporterModule, "reportError")
      .mockResolvedValue(undefined);

    const request = new Request("http://localhost:3000/api/telemetry/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: TEST_BASE_URL },
      body: JSON.stringify({
        message: "Network request failed",
        context: {
          password: "mySecretPassword",
          bankAccount: "0451000312345678",
          idNumber: "001203012345",
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(reportSpy).toHaveBeenCalledTimes(1);
    const call2 = reportSpy.mock.calls[0];
    expect(call2).toBeDefined();
    const callArg = call2![0];
    expect(callArg.context?.password).toBe("[REDACTED]");
    expect(callArg.context?.bankAccount).toBe("***678");
    expect(callArg.context?.idNumber).toBe("001***45");

    reportSpy.mockRestore();
  });

  it("rejects request when message is missing", async () => {
    const request = new Request("http://localhost:3000/api/telemetry/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: TEST_BASE_URL },
      body: JSON.stringify({ name: "ErrorWithoutMessage" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Missing error message");
  });

  it("rejects non-JSON payload", async () => {
    const request = new Request("http://localhost:3000/api/telemetry/errors", {
      method: "POST",
      headers: { "Content-Type": "text/plain", origin: TEST_BASE_URL },
      body: "not-json-content",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Payload must be JSON");
  });

  it("rejects payloads that exceed size limit", async () => {
    const hugePayload = "x".repeat(40 * 1024); // 40KB
    const request = new Request("http://localhost:3000/api/telemetry/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: TEST_BASE_URL },
      body: hugePayload,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects reports from another site", async () => {
    const reportSpy = vi
      .spyOn(reporterModule, "reportError")
      .mockResolvedValue(undefined);
    const body = JSON.stringify({ message: "boom" });

    const foreign = await POST(
      telemetryRequest(body, { origin: "https://evil.example" }),
    );
    expect(foreign.status).toBe(403);

    const noOrigin = new Request(`${TEST_BASE_URL}/api/telemetry/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect((await POST(noOrigin)).status).toBe(403);
    expect(reportSpy).not.toHaveBeenCalled();

    reportSpy.mockRestore();
  });

  it("limits reports per IP per minute", async () => {
    const reportSpy = vi
      .spyOn(reporterModule, "reportError")
      .mockResolvedValue(undefined);
    const body = JSON.stringify({ message: "boom" });

    for (let i = 0; i < TELEMETRY_LIMIT_PER_WINDOW; i += 1) {
      expect((await POST(telemetryRequest(body))).status).toBe(200);
    }
    const blocked = await POST(telemetryRequest(body));
    expect(blocked.status).toBe(429);
    expect(reportSpy).toHaveBeenCalledTimes(TELEMETRY_LIMIT_PER_WINDOW);

    // Another address keeps its own budget.
    const other = await POST(
      telemetryRequest(body, { "x-forwarded-for": "203.0.113.51" }),
    );
    expect(other.status).toBe(200);

    reportSpy.mockRestore();
  });

  it("does not share its budget with sign-in", async () => {
    const reportSpy = vi
      .spyOn(reporterModule, "reportError")
      .mockResolvedValue(undefined);
    const body = JSON.stringify({ message: "boom" });

    for (let i = 0; i < TELEMETRY_LIMIT_PER_WINDOW + 1; i += 1) {
      await POST(telemetryRequest(body));
    }
    const { consumeSignInAttempt } = await import("@/lib/auth/rate-limit");
    expect(await consumeSignInAttempt(ctx.db, "203.0.113.50", new Date())).toBe(
      true,
    );

    reportSpy.mockRestore();
  });
});
