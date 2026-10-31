import { describe, expect, it } from "vitest";

import { isTempPasswordExpired } from "./temp-password-expiry";

describe("isTempPasswordExpired", () => {
  const baseTime = new Date("2026-11-01T12:00:00.000Z");

  it("returns false if user status is LOCKED", () => {
    const expired = isTempPasswordExpired(
      {
        status: "LOCKED",
        mustChangePassword: true,
        tempPasswordExpiresAt: "2026-11-01T10:00:00.000Z",
      },
      baseTime,
    );
    expect(expired).toBe(false);
  });

  it("returns false if user does not need to change password", () => {
    const expired = isTempPasswordExpired(
      {
        status: "ACTIVE",
        mustChangePassword: false,
        tempPasswordExpiresAt: "2026-11-01T10:00:00.000Z",
      },
      baseTime,
    );
    expect(expired).toBe(false);
  });

  it("returns false if tempPasswordExpiresAt is null", () => {
    const expired = isTempPasswordExpired(
      {
        status: "ACTIVE",
        mustChangePassword: true,
        tempPasswordExpiresAt: null,
      },
      baseTime,
    );
    expect(expired).toBe(false);
  });

  it("returns false if current time is before expiration", () => {
    const expired = isTempPasswordExpired(
      {
        status: "ACTIVE",
        mustChangePassword: true,
        tempPasswordExpiresAt: "2026-11-01T14:00:00.000Z",
      },
      baseTime,
    );
    expect(expired).toBe(false);
  });

  it("returns true if current time is exactly at expiration (boundary)", () => {
    const expired = isTempPasswordExpired(
      {
        status: "ACTIVE",
        mustChangePassword: true,
        tempPasswordExpiresAt: "2026-11-01T12:00:00.000Z",
      },
      baseTime,
    );
    expect(expired).toBe(true);
  });

  it("returns true if current time is after expiration", () => {
    const expired = isTempPasswordExpired(
      {
        status: "ACTIVE",
        mustChangePassword: true,
        tempPasswordExpiresAt: "2026-11-01T11:59:59.000Z",
      },
      baseTime,
    );
    expect(expired).toBe(true);
  });
});
