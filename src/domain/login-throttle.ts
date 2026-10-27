// Locks a login name after repeated wrong passwords (design D3). Pure: the
// caller loads the state, asks, and stores what these functions return.

export const MAX_FAILED_ATTEMPTS = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface ThrottleState {
  failedCount: number;
  firstFailedAt: Date;
  lockedUntil: Date | null;
}

export type ThrottleDecision =
  { locked: false } | { locked: true; lockedUntil: Date };

export function evaluateLoginThrottle(
  state: ThrottleState | null,
  now: Date,
): ThrottleDecision {
  if (state?.lockedUntil && now < state.lockedUntil) {
    return { locked: true, lockedUntil: state.lockedUntil };
  }
  return { locked: false };
}

/**
 * State after one more wrong password. A failure that lands while the name
 * is locked (requests already in flight when the 5th failed) changes
 * nothing, so it can neither lift nor extend the lock.
 */
export function recordFailure(
  state: ThrottleState | null,
  now: Date,
): ThrottleState {
  if (state && evaluateLoginThrottle(state, now).locked) return state;
  const expired =
    state === null ||
    state.lockedUntil !== null ||
    now.getTime() - state.firstFailedAt.getTime() > FAILURE_WINDOW_MS;
  if (expired) {
    return { failedCount: 1, firstFailedAt: now, lockedUntil: null };
  }
  const failedCount = state.failedCount + 1;
  return {
    failedCount,
    firstFailedAt: state.firstFailedAt,
    lockedUntil:
      failedCount >= MAX_FAILED_ATTEMPTS
        ? new Date(now.getTime() + LOCK_DURATION_MS)
        : null,
  };
}
