export interface UserTempPasswordState {
  status: string;
  mustChangePassword: boolean;
  tempPasswordExpiresAt: string | null;
}

/**
 * Checks whether an active user's temporary password has expired.
 * An active user whose temporary password hasn't been changed yet
 * and whose expiration timestamp has passed is considered expired.
 */
export function isTempPasswordExpired(
  user: UserTempPasswordState,
  now: Date | string = new Date(),
): boolean {
  if (
    user.status !== "ACTIVE" ||
    !user.mustChangePassword ||
    !user.tempPasswordExpiresAt
  ) {
    return false;
  }
  const expiryTime = new Date(user.tempPasswordExpiresAt).getTime();
  const currentTime =
    now instanceof Date ? now.getTime() : new Date(now).getTime();
  return currentTime >= expiryTime;
}
