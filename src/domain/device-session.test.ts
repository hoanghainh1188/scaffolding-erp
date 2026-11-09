import { describe, expect, it } from "vitest";

import {
  DEVICE_SESSION_LIST_LIMIT,
  SHORT_SESSION_MS,
  allDevicesSummary,
  isLiveDeviceSession,
  otherDevicesSummary,
  signOutOutcome,
  toDeviceSessionRows,
  type DeviceSessionRecord,
} from "./device-session";

// 09/11/2026 10:00 giờ Việt Nam.
const NOW = new Date("2026-11-09T03:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0";

const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);

const record = (
  id: string,
  overrides: Partial<DeviceSessionRecord> = {},
): DeviceSessionRecord => ({
  id,
  userAgent: EDGE_WINDOWS,
  createdAt: ago(2),
  updatedAt: ago(2),
  expiresAt: new Date(NOW.getTime() + 24 * HOUR),
  persistent: true,
  ...overrides,
});

describe("isLiveDeviceSession", () => {
  it("drops an expired session", () => {
    expect(isLiveDeviceSession(record("a", { expiresAt: ago(1) }), NOW)).toBe(
      false,
    );
  });

  it("keeps a short session at exactly 12 hours", () => {
    const row = record("a", {
      persistent: false,
      createdAt: new Date(NOW.getTime() - SHORT_SESSION_MS),
    });
    expect(isLiveDeviceSession(row, NOW)).toBe(true);
  });

  it("drops a short session past 12 hours", () => {
    const row = record("a", {
      persistent: false,
      createdAt: new Date(NOW.getTime() - SHORT_SESSION_MS - 60_000),
    });
    expect(isLiveDeviceSession(row, NOW)).toBe(false);
  });

  it("keeps a remembered session past 12 hours", () => {
    expect(isLiveDeviceSession(record("a", { createdAt: ago(48) }), NOW)).toBe(
      true,
    );
  });
});

describe("toDeviceSessionRows", () => {
  it("puts this device first, then the most recently active", () => {
    const rows = toDeviceSessionRows(
      [
        record("old", { updatedAt: ago(30) }),
        record("recent", { updatedAt: ago(1) }),
        record("here", { updatedAt: ago(50) }),
      ],
      "here",
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(["here", "recent", "old"]);
    expect(rows.map((row) => row.isCurrent)).toEqual([true, false, false]);
  });

  it("names the device and dates in Vietnam time", () => {
    const [row] = toDeviceSessionRows(
      [
        record("a", {
          userAgent: CHROME_ANDROID,
          createdAt: new Date("2026-11-08T23:48:00.000Z"),
          updatedAt: new Date("2026-11-08T23:48:00.000Z"),
        }),
      ],
      "other",
      NOW,
    );
    expect(row?.deviceName).toBe("Điện thoại · Chrome");
    expect(row?.signedIn).toBe("Hôm nay, 06:48");
    expect(row?.lastActive).toBe("Hôm nay, 06:48");
  });

  it("leaves out sessions that are over", () => {
    const rows = toDeviceSessionRows(
      [record("live"), record("gone", { expiresAt: ago(1) })],
      "live",
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(["live"]);
  });

  it("stops at the list limit and keeps this device", () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      record(`s${index}`, { updatedAt: ago(index + 1) }),
    );
    const rows = toDeviceSessionRows(
      [...many, record("here", { updatedAt: ago(99) })],
      "here",
      NOW,
    );
    expect(rows).toHaveLength(DEVICE_SESSION_LIST_LIMIT);
    expect(rows[0]?.id).toBe("here");
  });

  it("carries no token or address, even if a row has them", () => {
    const rows = toDeviceSessionRows(
      [{ ...record("a"), token: "secret", ipAddress: "1.2.3.4" }] as never,
      "a",
      NOW,
    );
    expect(JSON.stringify(rows)).not.toMatch(/secret|1\.2\.3\.4|Mozilla/);
  });
});

describe("signOutOutcome", () => {
  it("logs nothing when nothing changed", () => {
    expect(signOutOutcome({ sessions: 0, trusted: 0 })).toEqual({
      log: false,
      suffix: "",
    });
  });

  it("logs a forgotten device with no session", () => {
    expect(signOutOutcome({ sessions: 0, trusted: 1 })).toEqual({
      log: true,
      suffix: ", quên 1 máy đã tin",
    });
  });

  it("adds no suffix when no device was forgotten", () => {
    expect(signOutOutcome({ sessions: 3, trusted: 0 })).toEqual({
      log: true,
      suffix: "",
    });
  });

  it("adds the suffix for both counts", () => {
    expect(signOutOutcome({ sessions: 3, trusted: 2 })).toEqual({
      log: true,
      suffix: ", quên 2 máy đã tin",
    });
  });
});

describe("activity summaries", () => {
  it("words other devices", () => {
    expect(otherDevicesSummary({ sessions: 3, trusted: 0 })).toBe(
      "Đăng xuất 3 máy khác",
    );
    expect(otherDevicesSummary({ sessions: 3, trusted: 2 })).toBe(
      "Đăng xuất 3 máy khác, quên 2 máy đã tin",
    );
  });

  it("words a director's sign-out", () => {
    expect(allDevicesSummary("vantung", { sessions: 2, trusted: 1 })).toBe(
      "Đăng xuất mọi máy của vantung (2 máy), quên 1 máy đã tin",
    );
    expect(allDevicesSummary("thuha", { sessions: 0, trusted: 1 })).toBe(
      "Đăng xuất mọi máy của thuha (0 máy), quên 1 máy đã tin",
    );
  });
});
