// What a cipher failure becomes (personal-data-protection D12): a fixed
// sentence for the user, and a report holding only the code and key number.
import { reportError } from "@/lib/monitoring/reporter";

import { PiiCipherError } from "./cipher";

export const PII_MESSAGES = {
  unreadable: "Không đọc được số CCCD, báo quản trị",
  notConfigured: "Chưa cấu hình PII_ENCRYPTION_KEYS, báo quản trị",
} as const;

export interface CipherFailure {
  ok: false;
  status: 500;
  error: string;
}

export async function cipherFailure(
  error: PiiCipherError,
): Promise<CipherFailure> {
  await reportError({
    name: error.name,
    message: `PII cipher failure: ${error.code}`,
    source: "server",
    context: { code: error.code, keyId: error.keyId },
  });
  const notConfigured =
    error.code === "KEYS_MISSING" || error.code === "KEYS_INVALID";
  return {
    ok: false,
    status: 500,
    error: notConfigured ? PII_MESSAGES.notConfigured : PII_MESSAGES.unreadable,
  };
}
