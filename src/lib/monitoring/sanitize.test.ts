import { describe, expect, it } from "vitest";
import { maskBankAccount, sanitizeErrorPayload, sanitizeUrl } from "./sanitize";

describe("sanitize.ts", () => {
  describe("maskBankAccount", () => {
    it("preserves only the last 3 digits", () => {
      expect(maskBankAccount("0451 0003 1234 5678")).toBe("***678");
      expect(maskBankAccount("123456789")).toBe("***789");
    });

    it("handles short numbers safely", () => {
      expect(maskBankAccount("123")).toBe("***123");
    });
  });

  describe("sanitizeUrl", () => {
    it("redacts sensitive query parameters in URLs", () => {
      const url =
        "https://example.com/api/test?token=secret123&code=456&name=alice";
      const sanitized = sanitizeUrl(url);
      expect(sanitized).toBe(
        "https://example.com/api/test?token=%5BREDACTED%5D&code=%5BREDACTED%5D&name=alice",
      );
    });

    it("returns original string if no sensitive query parameters", () => {
      const url = "https://example.com/path?foo=bar";
      expect(sanitizeUrl(url)).toBe(url);
    });
  });

  describe("sanitizeErrorPayload content scan (personal-data-protection D10)", () => {
    const query = "Failed query: insert ... params: 001203012345,Anh Tam";
    const ciphertext = "pii1.1.abc_DEF-1.ghi_JKL-2";

    it("replaces 12 digits in message and stack of an Error", () => {
      const error = new Error(query);
      error.stack = `Error: ${query}\n    at x (y.ts:1:2)`;
      const clean = sanitizeErrorPayload({ error }) as unknown as {
        error: { message: string; stack: string };
      };
      expect(clean.error.message).toBe(
        "Failed query: insert ... params: [CCCD],Anh Tam",
      );
      expect(clean.error.stack).toContain("[CCCD]");
      expect(clean.error.stack).not.toContain("001203012345");
    });

    it("replaces 12 digits in plain report fields", () => {
      expect(sanitizeErrorPayload({ message: query, stack: query })).toEqual({
        message: "Failed query: insert ... params: [CCCD],Anh Tam",
        stack: "Failed query: insert ... params: [CCCD],Anh Tam",
      });
    });

    it.each([
      ["cccd_001203012345", "cccd_[CCCD]"],
      ["CCCD001203012345", "CCCD[CCCD]"],
      ["so001203012345x", "so[CCCD]x"],
    ])("replaces 12 digits next to letters: %s", (input, output) => {
      expect(sanitizeErrorPayload({ message: input })).toEqual({
        message: output,
      });
    });

    it("leaves shorter and longer digit runs", () => {
      expect(sanitizeErrorPayload({ a: "12345678901 1234567890123" })).toEqual({
        a: "12345678901 1234567890123",
      });
    });

    it("replaces ciphertext inside a string", () => {
      expect(
        sanitizeErrorPayload({ message: `bad value ${ciphertext} here` }),
      ).toEqual({ message: "bad value [REDACTED] here" });
    });

    it("removes ciphertext and key fields entirely", () => {
      expect(
        sanitizeErrorPayload({
          idNumberEnc: "anything",
          id_number_enc: "anything",
          taxIdentityEnc: "anything",
          PII_ENCRYPTION_KEYS: "1:abc",
        }),
      ).toEqual({
        idNumberEnc: "[REDACTED]",
        id_number_enc: "[REDACTED]",
        taxIdentityEnc: "[REDACTED]",
        PII_ENCRYPTION_KEYS: "[REDACTED]",
      });
    });

    it("removes a CCCD field whole, keeping no digit", () => {
      expect(sanitizeErrorPayload({ idNumber: "001203012345" })).toEqual({
        idNumber: "[REDACTED]",
      });
    });

    it("removes a CCCD field given as a number", () => {
      expect(
        sanitizeErrorPayload({
          cccd: 12_030_123_456,
          id_number: 1_203_012_345,
        }),
      ).toEqual({ cccd: "[REDACTED]", id_number: "[REDACTED]" });
    });
  });

  describe("sanitizeErrorPayload", () => {
    it("redacts authentication credentials and tokens", () => {
      const payload = {
        message: "Failed login",
        password: "SuperSecretPassword123!",
        currentPassword: "OldPassword",
        token: "eyJhbGciOi...",
        headers: {
          authorization: "Bearer secret-token",
          cookie: "better-auth.session_token=secret_val; other=123",
          "set-cookie": "secret-session-id",
        },
      };

      const sanitized = sanitizeErrorPayload(payload);

      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.currentPassword).toBe("[REDACTED]");
      expect(sanitized.token).toBe("[REDACTED]");
      expect(sanitized.headers.authorization).toBe("[REDACTED]");
      expect(sanitized.headers.cookie).toContain("[REDACTED]");
      expect(sanitized.headers.cookie).toContain("hasSession=true");
      expect(sanitized.headers["set-cookie"]).toBe("[REDACTED]");
    });

    it("masks personal identity numbers and bank accounts", () => {
      const payload = {
        user: {
          name: "Nguyen Van A",
          idNumber: "001203012345",
          bankAccount: "0451000312345678",
        },
      };

      const sanitized = sanitizeErrorPayload(payload);

      expect(sanitized.user.name).toBe("Nguyen Van A");
      expect(sanitized.user.idNumber).toBe("[REDACTED]");
      expect(sanitized.user.bankAccount).toBe("***678");
    });

    it("handles Error instances and preserves digest/stack", () => {
      const err = new Error("Database connection timed out");
      (err as unknown as { digest: string }).digest = "NEXT_DIGEST_12345";

      const sanitized = sanitizeErrorPayload(err) as unknown as Record<
        string,
        unknown
      >;

      expect(sanitized.name).toBe("Error");
      expect(sanitized.message).toBe("Database connection timed out");
      expect(sanitized.digest).toBe("NEXT_DIGEST_12345");
      expect(sanitized.stack).toBeDefined();
    });

    it("handles circular references gracefully", () => {
      const cyclic: Record<string, unknown> = { name: "CyclicObject" };
      cyclic.self = cyclic;

      const sanitized = sanitizeErrorPayload(cyclic);
      expect(sanitized.name).toBe("CyclicObject");
      expect(sanitized.self).toBe("[Circular]");
    });
  });
});
