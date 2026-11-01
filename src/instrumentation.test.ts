import { describe, expect, it, vi } from "vitest";
import { onRequestError } from "./instrumentation";
import * as reporterModule from "./lib/monitoring/reporter";

describe("instrumentation.ts onRequestError", () => {
  it("captures server Error instance with digest, request and context", async () => {
    const reportSpy = vi
      .spyOn(reporterModule, "reportError")
      .mockResolvedValue(undefined);

    const error = new Error("Failed to render page");
    (error as unknown as { digest: string }).digest = "DIGEST_XYZ_123";

    await onRequestError(
      error,
      {
        path: "/inventory/stocktakes",
        method: "GET",
        headers: {
          authorization: "Bearer secret-token",
          "user-agent": "Mozilla/5.0",
        },
      },
      {
        routerKind: "App Router",
        routePath: "/inventory/stocktakes",
        routeType: "render",
      },
    );

    expect(reportSpy).toHaveBeenCalledTimes(1);
    const call = reportSpy.mock.calls[0];
    expect(call).toBeDefined();
    const callArg = call![0];

    expect(callArg.message).toBe("Failed to render page");
    expect(callArg.digest).toBe("DIGEST_XYZ_123");
    expect(callArg.source).toBe("server");
    expect(callArg.path).toBe("/inventory/stocktakes");
    expect(callArg.method).toBe("GET");
    expect(callArg.headers).toBeDefined();
    expect(callArg.context?.routeType).toBe("render");

    reportSpy.mockRestore();
  });

  it("handles non-Error objects safely", async () => {
    const reportSpy = vi
      .spyOn(reporterModule, "reportError")
      .mockResolvedValue(undefined);

    await onRequestError(
      "Direct string exception thrown",
      {
        path: "/api/orders",
        method: "POST",
        headers: {},
      },
      {
        routerKind: "App Router",
        routePath: "/api/orders",
        routeType: "route",
      },
    );

    expect(reportSpy).toHaveBeenCalledTimes(1);
    const call = reportSpy.mock.calls[0];
    expect(call).toBeDefined();
    const callArg = call![0];
    expect(callArg.message).toBe("Direct string exception thrown");
    expect(callArg.source).toBe("server");

    reportSpy.mockRestore();
  });
});
