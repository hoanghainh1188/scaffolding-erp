import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import * as reporterModule from "@/lib/monitoring/reporter";

describe("POST /api/telemetry/errors", () => {
  it("accepts valid error report and returns 200", async () => {
    const reportSpy = vi.spyOn(reporterModule, "reportError").mockResolvedValue(undefined);

    const request = new Request("http://localhost:3000/api/telemetry/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    expect(callArg.message).toBe("Uncaught TypeError: Cannot read properties of undefined");
    expect(callArg.name).toBe("TypeError");
    expect(callArg.source).toBe("client");

    reportSpy.mockRestore();
  });

  it("sanitizes sensitive fields in client error context before reporting", async () => {
    const reportSpy = vi.spyOn(reporterModule, "reportError").mockResolvedValue(undefined);

    const request = new Request("http://localhost:3000/api/telemetry/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "text/plain" },
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
      headers: { "Content-Type": "application/json" },
      body: hugePayload,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
