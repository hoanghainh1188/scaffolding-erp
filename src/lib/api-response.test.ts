import { describe, expect, it } from "vitest";

import { fail, ok } from "./api-response";

describe("api response envelope", () => {
  it("wraps data on success", async () => {
    const response = ok({ status: "ok" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { status: "ok" },
      error: null,
    });
  });

  it("wraps an error message and optional data on failure", async () => {
    const response = fail("Không kết nối được cơ sở dữ liệu", 503, { a: 1 });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      data: { a: 1 },
      error: "Không kết nối được cơ sở dữ liệu",
    });
  });

  it("defaults failure data to null", async () => {
    expect((await fail("Lỗi", 400).json()).data).toBeNull();
  });
});
