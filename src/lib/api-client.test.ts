import { afterEach, describe, expect, it, vi } from "vitest";

import { NETWORK_ERROR_MESSAGE, callApi } from "./api-client";

const respondWith = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
    }),
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe("callApi", () => {
  it("unwraps a successful envelope and sends JSON", async () => {
    const fetch = respondWith({
      success: true,
      data: { id: "1" },
      error: null,
    });
    const result = await callApi("/api/users", {
      method: "POST",
      body: { name: "Đức Lực" },
    });
    expect(result).toEqual({ ok: true, data: { id: "1" } });
    const [, init] = fetch.mock.calls[0] ?? [];
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Đức Lực" }),
    });
  });

  it("returns the server's message on an error status", async () => {
    respondWith(
      { success: false, data: null, error: "Tên đăng nhập đã có người dùng" },
      409,
    );
    expect(await callApi("/api/users")).toEqual({
      ok: false,
      error: "Tên đăng nhập đã có người dùng",
    });
  });

  it("explains a network failure or a body that is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    expect(await callApi("/api/users")).toEqual({
      ok: false,
      error: NETWORK_ERROR_MESSAGE,
    });
    vi.restoreAllMocks();
    respondWith("<html>502</html>", 502);
    expect(await callApi("/api/users")).toEqual({
      ok: false,
      error: NETWORK_ERROR_MESSAGE,
    });
  });
});
