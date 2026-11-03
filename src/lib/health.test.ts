import { afterEach, describe, expect, it, vi } from "vitest";

import { checkHealth, healthResponse, withPhotoStorage } from "./health";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("checkHealth", () => {
  it("is ok when the probe answers", async () => {
    expect(await checkHealth(async () => {})).toEqual({
      status: "ok",
      database: "ok",
    });
  });

  it("is degraded and logs the cause when the probe fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await checkHealth(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    });
    expect(result).toEqual({ status: "degraded", database: "unreachable" });
    expect(log).toHaveBeenCalledOnce();
  });

  it("gives up after the timeout instead of hanging", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = checkHealth(() => new Promise(() => {}), 3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual({
      status: "degraded",
      database: "unreachable",
    });
  });
});

describe("healthResponse", () => {
  it("returns 200 with the envelope when healthy", async () => {
    const response = healthResponse({ status: "ok", database: "ok" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { status: "ok", database: "ok" },
      error: null,
    });
  });

  it("returns 503 with a Vietnamese error when the database is down", async () => {
    const response = healthResponse({
      status: "degraded",
      database: "unreachable",
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      data: { status: "degraded", database: "unreachable" },
      error: "Không kết nối được cơ sở dữ liệu",
    });
  });
});

describe("withPhotoStorage", () => {
  const MB = 1024 * 1024;
  const up = { status: "ok", database: "ok" } as const;

  it("warns above 200 MB, without figures", async () => {
    const report = await withPhotoStorage(up, async () => 210 * MB);
    expect(report).toEqual({ ...up, photoStorage: "warning" });
    expect(JSON.stringify(report)).not.toMatch(/\d/);
  });

  it("is ok below the threshold", async () => {
    expect(await withPhotoStorage(up, async () => 35 * MB)).toEqual({
      ...up,
      photoStorage: "ok",
    });
  });

  it("leaves a degraded report and a failed sum alone", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = { status: "degraded", database: "unreachable" } as const;
    expect(await withPhotoStorage(down, async () => 210 * MB)).toEqual(down);
    expect(
      await withPhotoStorage(up, async () => {
        throw new Error("boom");
      }),
    ).toEqual(up);
  });
});
