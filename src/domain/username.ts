export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

// Lower-case ASCII letters and digits, with single dots or underscores
// between them: minhanh, thu.ha, kho_2.
const USERNAME_PATTERN = /^[a-z0-9]+(?:[._][a-z0-9]+)*$/;

/** How a typed login name is compared: case and outer spaces do not count. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

/** Whether an already normalized login name follows the D17 rule. */
export function isValidUsername(username: string): boolean {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(username)
  );
}

/**
 * Better Auth needs a unique email per user. Ours is never shown or mailed:
 * `.invalid` is reserved and can never receive mail (RFC 2606).
 */
export function placeholderEmail(username: string): string {
  return `${username}@users.invalid`;
}
