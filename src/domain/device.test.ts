import { describe, expect, it } from "vitest";

import { detectDevice, formatLastLogin } from "./device";

const AGENTS = {
  android:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
};

describe("detectDevice", () => {
  it.each([
    ["android", "MOBILE"],
    ["iphone", "MOBILE"],
    ["edgeWindows", "DESKTOP"],
    ["safariMac", "DESKTOP"],
  ] as const)("%s is %s", (agent, device) => {
    expect(detectDevice(AGENTS[agent])).toBe(device);
  });

  it("treats a missing agent as a computer", () => {
    expect(detectDevice("")).toBe("DESKTOP");
    expect(detectDevice(null)).toBe("DESKTOP");
  });
});

describe("formatLastLogin", () => {
  // 27/10/2026, 09:00 in Vietnam.
  const now = new Date("2026-10-27T02:00:00Z");

  it("says never for a new account", () => {
    expect(formatLastLogin(null, now)).toBe("Chưa đăng nhập");
  });

  it("uses Vietnam time for today", () => {
    // 23:48 UTC on the 26th is 06:48 on the 27th in Vietnam.
    expect(formatLastLogin(new Date("2026-10-26T23:48:00Z"), now)).toBe(
      "Hôm nay, 06:48",
    );
  });

  it("says yesterday across Vietnam midnight", () => {
    // 16:59 UTC on the 26th is 23:59 on the 26th in Vietnam.
    expect(formatLastLogin(new Date("2026-10-26T16:59:00Z"), now)).toBe(
      "Hôm qua, 23:59",
    );
    // 17:00 UTC on the 26th is already 00:00 on the 27th.
    expect(formatLastLogin(new Date("2026-10-26T17:00:00Z"), now)).toBe(
      "Hôm nay, 00:00",
    );
  });

  it("shows the date for older sign-ins", () => {
    expect(formatLastLogin(new Date("2026-10-23T09:20:00Z"), now)).toBe(
      "23/10/2026, 16:20",
    );
  });
});
