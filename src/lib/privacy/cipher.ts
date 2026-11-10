// AES-256-GCM for personal data (personal-data-protection D1). Pure: keys come
// in as parameters. The associated data ties a ciphertext to one seller and
// one column, so a copied value does not decrypt.
//
// Who may call the two decrypt functions is held by
// src/lib/privacy/pii-coverage.test.ts.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const FORMAT = "pii1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const CIPHERTEXT = /^pii1\.([0-9]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;

export interface PiiKey {
  readonly id: number;
  readonly key: Buffer;
}

/** The first key encrypts; every key decrypts. */
export interface PiiKeyRing {
  readonly current: PiiKey;
  readonly all: readonly PiiKey[];
}

export type PiiCipherErrorCode =
  | "KEYS_MISSING"
  | "KEYS_INVALID"
  | "KEY_NOT_FOUND"
  | "MALFORMED"
  | "AUTH_FAILED";

function describe(code: PiiCipherErrorCode, keyId: number | null): string {
  switch (code) {
    case "KEYS_MISSING":
      return "Thiếu biến PII_ENCRYPTION_KEYS";
    case "KEYS_INVALID":
      return "Biến PII_ENCRYPTION_KEYS sai dạng";
    case "KEY_NOT_FOUND":
      return `Không giải mã được: không có khóa số ${keyId}`;
    case "MALFORMED":
      return "Không giải mã được: bản mã sai định dạng";
    case "AUTH_FAILED":
      return `Không giải mã được: lỗi xác thực với khóa số ${keyId}`;
  }
}

/**
 * What a command may print when it fails. A database error's message holds
 * the query and its parameters, and CI keeps that log: name and code only.
 */
export function safeFailureText(error: unknown): string {
  if (error instanceof PiiCipherError) return error.message;
  const name = error instanceof Error ? error.name : "UnknownError";
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === "string" ? `${name} (mã ${code})` : name;
}

/** Carries only a code and a key number, never a value (design D2). */
export class PiiCipherError extends Error {
  override readonly name = "PiiCipherError";
  readonly code: PiiCipherErrorCode;
  readonly keyId: number | null;

  constructor(code: PiiCipherErrorCode, keyId: number | null = null) {
    super(describe(code, keyId));
    this.code = code;
    this.keyId = keyId;
  }
}

type Field = "id_number" | "tax_identity";

const associatedData = (supplierId: string, field: Field): Buffer =>
  Buffer.from(`supplier:${supplierId}:${field}`, "utf8");

function encrypt(plain: string, aad: Buffer, key: PiiKey): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key.key, iv).setAAD(aad);
  const body = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return [
    FORMAT,
    key.id,
    iv.toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

function decrypt(ciphertext: string, aad: Buffer, ring: PiiKeyRing): string {
  const match = CIPHERTEXT.exec(ciphertext);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new PiiCipherError("MALFORMED");
  }
  const keyId = Number(match[1]);
  const key = ring.all.find((candidate) => candidate.id === keyId);
  if (!key) throw new PiiCipherError("KEY_NOT_FOUND", keyId);
  const iv = Buffer.from(match[2], "base64url");
  const body = Buffer.from(match[3], "base64url");
  if (iv.length !== IV_BYTES || body.length <= TAG_BYTES) {
    throw new PiiCipherError("MALFORMED", keyId);
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key.key, iv)
      .setAAD(aad)
      .setAuthTag(body.subarray(body.length - TAG_BYTES));
    return Buffer.concat([
      decipher.update(body.subarray(0, body.length - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // The original error is dropped on purpose: nothing of it may travel.
    throw new PiiCipherError("AUTH_FAILED", keyId);
  }
}

export function encryptIdNumber(
  supplierId: string,
  idNumber: string,
  ring: PiiKeyRing,
): string {
  return encrypt(
    idNumber,
    associatedData(supplierId, "id_number"),
    ring.current,
  );
}

/** Allowed callers: partners.ts, anonymize.ts, rotate.ts. */
export function decryptIdNumber(
  supplierId: string,
  ciphertext: string,
  ring: PiiKeyRing,
): string {
  return decrypt(ciphertext, associatedData(supplierId, "id_number"), ring);
}

/** What the tax file of an erased seller keeps (design D7, 0.2 số 161). */
export interface TaxIdentity {
  readonly name: string;
  readonly address: string | null;
  readonly idNumber: string | null;
}

export function encryptTaxIdentity(
  supplierId: string,
  identity: TaxIdentity,
  ring: PiiKeyRing,
): string {
  return encrypt(
    JSON.stringify(identity),
    associatedData(supplierId, "tax_identity"),
    ring.current,
  );
}

/** Allowed callers: rotate.ts only; no screen or API reads the tax file. */
export function decryptTaxIdentity(
  supplierId: string,
  ciphertext: string,
  ring: PiiKeyRing,
): TaxIdentity {
  return JSON.parse(
    decrypt(ciphertext, associatedData(supplierId, "tax_identity"), ring),
  ) as TaxIdentity;
}

/** Prefix of every ciphertext made with this key (rotation's filter). */
export function ciphertextPrefix(key: PiiKey): string {
  return `${FORMAT}.${key.id}.`;
}
