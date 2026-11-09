// Rules of the second factor (director-mfa). Pure, and free of Node APIs so
// the sign-in form can classify what is typed.
import { canManageTwoFactor, type AccountUser } from "./permissions";

export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_LENGTH = 16;
const BACKUP_CODE_GROUP = 4;

/** Crockford base32: no I, L, O, U, which read like other characters. */
export const BACKUP_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** How long the step after the password stays open. */
export const TWO_FACTOR_CHALLENGE_SECONDS = 10 * 60;
/** A code lives at most 90 s (one step either side); kept out a bit longer. */
export const TOTP_REUSE_WINDOW_SECONDS = 120;
export const TWO_FACTOR_MANAGE_LIMIT_PER_MINUTE = 5;
export const TRUST_DEVICE_DAYS = 30;

/** Must this account have a second factor before it can do anything? */
export function isTwoFactorRequired(
  user: AccountUser,
  demoMode: boolean,
): boolean {
  return !demoMode && canManageTwoFactor(user);
}

/** The canonical form of a typed backup code, or null if it cannot be one. */
export function normalizeBackupCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  const valid =
    code.length === BACKUP_CODE_LENGTH &&
    [...code].every((char) => BACKUP_CODE_ALPHABET.includes(char));
  return valid ? code : null;
}

/** `XXXX-XXXX-XXXX-XXXX`, the way a code is shown. */
export function formatBackupCode(code: string): string {
  return chunks(code, BACKUP_CODE_GROUP).join("-");
}

export type OneTimeCode =
  { kind: "TOTP"; code: string } | { kind: "BACKUP"; code: string };

/** Exactly 6 digits is an app code; anything else must be a backup code. */
export function classifyCode(input: string): OneTimeCode | null {
  const compact = input.replace(/\s/g, "");
  if (/^\d{6}$/.test(compact)) return { kind: "TOTP", code: compact };
  const backup = normalizeBackupCode(input);
  return backup ? { kind: "BACKUP", code: backup } : null;
}

/**
 * The app's entry reads `<company>:<username>` instead of the placeholder
 * email Better Auth puts there. Secret and timing stay untouched.
 */
export function relabelTotpUri(
  uri: string,
  issuer: string,
  username: string,
): string {
  const query = new URLSearchParams(uri.split("?")[1] ?? "");
  query.set("issuer", issuer);
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(username)}`;
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** The secret of a TOTP URI in groups of 4, for typing by hand. */
export function secretTextOf(uri: string): string {
  const secret = new URLSearchParams(uri.split("?")[1] ?? "").get("secret");
  return chunks(secret ?? "", BACKUP_CODE_GROUP).join(" ");
}

function chunks(text: string, size: number): string[] {
  return text.match(new RegExp(`.{1,${size}}`, "g")) ?? [];
}
