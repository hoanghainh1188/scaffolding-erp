import { describe, expect, it } from "vitest";

import {
  evaluateLoginThrottle,
  recordFailure,
  type ThrottleState,
} from "./login-throttle";

const at = (time: string) => new Date(`2026-11-02T${time}:00+07:00`);

/** Applies wrong passwords at the given local times. */
function failAt(...times: string[]): ThrottleState | null {
  return times.reduce<ThrottleState | null>(
    (state, time) => recordFailure(state, at(time)),
    null,
  );
}

describe("login throttle", () => {
  it("lets a name with no failures through", () => {
    expect(evaluateLoginThrottle(null, at("08:00"))).toEqual({ locked: false });
  });

  it("still lets the name through after 4 wrong tries", () => {
    const state = failAt("08:00", "08:01", "08:01", "08:02");
    expect(state?.failedCount).toBe(4);
    expect(evaluateLoginThrottle(state, at("08:02"))).toEqual({
      locked: false,
    });
  });

  it("locks for 15 minutes from the 5th wrong try", () => {
    const state = failAt("08:00", "08:01", "08:01", "08:02", "08:03");
    expect(evaluateLoginThrottle(state, at("08:04"))).toEqual({
      locked: true,
      lockedUntil: at("08:18"),
    });
  });

  it("opens again 15 minutes after the 5th try", () => {
    const state = failAt("08:00", "08:01", "08:01", "08:02", "08:03");
    expect(evaluateLoginThrottle(state, at("08:17")).locked).toBe(true);
    expect(evaluateLoginThrottle(state, at("08:18")).locked).toBe(false);
    expect(evaluateLoginThrottle(state, at("08:19")).locked).toBe(false);
  });

  it("counts from 1 again after the lock has passed", () => {
    const locked = failAt("08:00", "08:01", "08:01", "08:02", "08:03");
    expect(recordFailure(locked, at("08:19"))).toEqual({
      failedCount: 1,
      firstFailedAt: at("08:19"),
      lockedUntil: null,
    });
  });

  it("keeps a running lock when a late failure arrives", () => {
    // Several wrong passwords were in flight when the 5th one locked.
    const locked = failAt("08:00", "08:01", "08:01", "08:02", "08:03");
    expect(recordFailure(locked, at("08:03"))).toEqual(locked);
    expect(recordFailure(locked, at("08:17"))).toEqual(locked);
  });

  it("counts from 1 when the first failure is older than 15 minutes", () => {
    const state = failAt("08:00", "08:05", "08:10", "08:14", "08:16");
    expect(state).toEqual({
      failedCount: 1,
      firstFailedAt: at("08:16"),
      lockedUntil: null,
    });
  });

  it("still counts a try exactly 15 minutes after the first", () => {
    const state = failAt("08:00", "08:05", "08:10", "08:14", "08:15");
    expect(evaluateLoginThrottle(state, at("08:15")).locked).toBe(true);
  });
});
