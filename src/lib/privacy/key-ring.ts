// The only place that finds the keys (personal-data-protection D2). One
// company, one deployment, one variable today; a SaaS version changes only
// this function (0.2 #33).
import { parsePiiKeys } from "@/lib/env";

import { PiiCipherError, type PiiKeyRing } from "./cipher";

export function getPiiKeyRing(): PiiKeyRing {
  const raw = process.env.PII_ENCRYPTION_KEYS;
  if (!raw) throw new PiiCipherError("KEYS_MISSING");
  const keys = parsePiiKeys(raw);
  const current = keys?.[0];
  if (!keys || !current) throw new PiiCipherError("KEYS_INVALID");
  return { current, all: keys };
}
