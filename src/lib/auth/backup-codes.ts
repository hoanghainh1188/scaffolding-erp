// Backup codes of the second factor (director-mfa design D4): shown once,
// stored only as hashes. Better Auth keeps them through the two functions of
// `hashedBackupCodeStore`, and compares what the caller passes with what is
// stored, so callers pass `hashBackupCode(typed)`.
import { createHash, randomInt } from "node:crypto";

import {
  BACKUP_CODE_ALPHABET,
  BACKUP_CODE_COUNT,
  BACKUP_CODE_LENGTH,
  formatBackupCode,
  normalizeBackupCode,
} from "@/domain/two-factor";

const HASH_PREFIX = "sha256:";

/** Fresh codes in display form. 80 random bits each. */
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const code = Array.from(
      { length: BACKUP_CODE_LENGTH },
      () => BACKUP_CODE_ALPHABET[randomInt(BACKUP_CODE_ALPHABET.length)],
    ).join("");
    return formatBackupCode(code);
  });
}

/** Hash of a code in any typed form; already hashed values stay as they are. */
export function hashBackupCode(code: string): string {
  if (code.startsWith(HASH_PREFIX)) return code;
  const canonical = normalizeBackupCode(code) ?? code;
  return `${HASH_PREFIX}${createHash("sha256").update(canonical).digest("hex")}`;
}

/**
 * Plugs into `storeBackupCodes`. The plugin writes the remaining codes back
 * through `encrypt` after each use, hence hashing is idempotent.
 */
export const hashedBackupCodeStore = {
  encrypt: async (json: string): Promise<string> =>
    JSON.stringify((JSON.parse(json) as string[]).map(hashBackupCode)),
  decrypt: async (stored: string): Promise<string> => stored,
};
