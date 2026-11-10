import { describe, expect, it } from "vitest";

import {
  PiiCipherError,
  ciphertextPrefix,
  safeFailureText,
  decryptIdNumber,
  decryptTaxIdentity,
  encryptIdNumber,
  encryptTaxIdentity,
  type PiiKeyRing,
} from "./cipher";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CCCD = "001203012345";
const keyOne = { id: 1, key: Buffer.alloc(32, 1) };
const keyTwo = { id: 2, key: Buffer.alloc(32, 2) };
const ring: PiiKeyRing = { current: keyOne, all: [keyOne] };
const newRing: PiiKeyRing = { current: keyTwo, all: [keyTwo, keyOne] };

function failure(run: () => unknown): PiiCipherError {
  try {
    run();
  } catch (error) {
    return error as PiiCipherError;
  }
  throw new Error("expected a failure");
}

function flip(ciphertext: string): string {
  const position = ciphertext.length - 6;
  const next = ciphertext[position] === "A" ? "B" : "A";
  return ciphertext.slice(0, position) + next + ciphertext.slice(position + 1);
}

describe("id number cipher", () => {
  it("round-trips and carries the key number", () => {
    const ciphertext = encryptIdNumber(ID, CCCD, ring);
    expect(ciphertext.startsWith("pii1.1.")).toBe(true);
    expect(ciphertext).not.toContain(CCCD);
    expect(decryptIdNumber(ID, ciphertext, ring)).toBe(CCCD);
  });

  it("gives two different ciphertexts for the same number", () => {
    expect(encryptIdNumber(ID, CCCD, ring)).not.toBe(
      encryptIdNumber(ID, CCCD, ring),
    );
  });

  it("decrypts with an old key while the new one encrypts", () => {
    const old = encryptIdNumber(ID, CCCD, ring);
    expect(decryptIdNumber(ID, old, newRing)).toBe(CCCD);
    expect(encryptIdNumber(ID, CCCD, newRing).startsWith("pii1.2.")).toBe(true);
  });

  it("does not decrypt on another seller's row", () => {
    const error = failure(() =>
      decryptIdNumber(OTHER, encryptIdNumber(ID, CCCD, ring), ring),
    );
    expect(error).toBeInstanceOf(PiiCipherError);
    expect(error.code).toBe("AUTH_FAILED");
  });

  it("names the missing key without the ciphertext", () => {
    const ciphertext = encryptIdNumber(ID, CCCD, ring);
    const error = failure(() =>
      decryptIdNumber(ID, ciphertext, { current: keyTwo, all: [keyTwo] }),
    );
    expect(error.code).toBe("KEY_NOT_FOUND");
    expect(error.message).toContain("không có khóa số 1");
    expect(error.message).not.toContain(ciphertext);
  });

  it("reports a wrong key under the same number as an auth failure", () => {
    const wrong = { id: 1, key: Buffer.alloc(32, 9) };
    const error = failure(() =>
      decryptIdNumber(ID, encryptIdNumber(ID, CCCD, ring), {
        current: wrong,
        all: [wrong],
      }),
    );
    expect(error.code).toBe("AUTH_FAILED");
    expect(error.keyId).toBe(1);
  });

  it("rejects a changed ciphertext instead of returning wrong text", () => {
    const changed = flip(encryptIdNumber(ID, CCCD, ring));
    expect(failure(() => decryptIdNumber(ID, changed, ring)).code).toBe(
      "AUTH_FAILED",
    );
  });

  it.each(["001203012345", "pii1.1.abc", "pii1.1.YWJj.YWJj", "pii1.x.a.b"])(
    "rejects the malformed value %s",
    (value) => {
      expect(failure(() => decryptIdNumber(ID, value, ring)).code).toBe(
        "MALFORMED",
      );
    },
  );

  it("leaks nothing through the error", () => {
    const ciphertext = encryptIdNumber(ID, CCCD, ring);
    const error = failure(() => decryptIdNumber(OTHER, ciphertext, ring));
    const text = `${error.message} ${JSON.stringify(error)} ${String(error.stack)}`;
    expect(text).not.toContain(CCCD);
    expect(text).not.toContain(ciphertext);
    expect(text).not.toContain(keyOne.key.toString("base64"));
    expect(error.cause).toBeUndefined();
  });
});

describe("tax identity cipher", () => {
  const identity = {
    name: "Anh Lê Văn Tâm",
    address: "12 Trần Phú, Hà Đông",
    idNumber: CCCD,
  };

  it("round-trips the whole file", () => {
    const ciphertext = encryptTaxIdentity(ID, identity, ring);
    expect(ciphertext.startsWith("pii1.1.")).toBe(true);
    expect(decryptTaxIdentity(ID, ciphertext, ring)).toEqual(identity);
  });

  it("keeps a file without a CCCD", () => {
    const file = { ...identity, idNumber: null };
    expect(
      decryptTaxIdentity(ID, encryptTaxIdentity(ID, file, ring), ring),
    ).toEqual(file);
  });

  it("cannot be read as the CCCD column, nor the reverse", () => {
    const file = encryptTaxIdentity(ID, identity, ring);
    expect(failure(() => decryptIdNumber(ID, file, ring)).code).toBe(
      "AUTH_FAILED",
    );
    const number = encryptIdNumber(ID, CCCD, ring);
    expect(failure(() => decryptTaxIdentity(ID, number, ring)).code).toBe(
      "AUTH_FAILED",
    );
  });
});

describe("safeFailureText", () => {
  it("keeps the cipher message, which holds no value", () => {
    expect(safeFailureText(new PiiCipherError("KEY_NOT_FOUND", 3))).toContain(
      "không có khóa số 3",
    );
  });

  it("drops the query and parameters of a database error", () => {
    const error = new Error(
      `Failed query: update ... params: ${CCCD},pii1.1.a.b`,
      {
        cause: { code: "23514" },
      },
    );
    expect(safeFailureText(error)).toBe("Error (mã 23514)");
  });

  it("handles something that is not an error", () => {
    expect(safeFailureText("x")).toBe("UnknownError");
  });
});

describe("ciphertextPrefix", () => {
  it("does not confuse key 1 with key 12", () => {
    expect(ciphertextPrefix(keyOne)).toBe("pii1.1.");
    expect("pii1.12.a.b".startsWith(ciphertextPrefix(keyOne))).toBe(false);
  });
});
