/**
 * Error payload sanitization for telemetry & monitoring (K11).
 * Strips credentials, tokens, sensitive headers, and masks personal data (CCCD, bank accounts)
 * in compliance with Decree 13/2023/ND-CP and privacy requirements.
 */

const REDACTED_VALUE = "[REDACTED]";

// Keys that must always have their values completely redacted
const SENSITIVE_KEY_PATTERN =
  /^(password|currentpassword|newpassword|confirmpassword|secret|token|authorization|cookie|set-cookie|apikey|api_key|accesstoken|access_token|refreshtoken|refresh_token|idnumberenc|id_number_enc|taxidentityenc|tax_identity_enc|pii_encryption_keys)$/i;

// Keys representing personal identity number (CCCD/CMND)
const ID_NUMBER_KEY_PATTERN =
  /^(idnumber|identitynumber|cccd|cmnd|id_number|identity_number)$/i;

// Keys representing bank account numbers
const BANK_ACCOUNT_KEY_PATTERN =
  /^(bankaccount|accountnumber|stk|bank_account|account_number)$/i;

// Content, not field names (personal-data-protection D10): a CCCD or a
// ciphertext can sit inside an error message or a stack trace.
const TWELVE_DIGITS = /\b\d{12}\b/g;
const CIPHERTEXT = /pii1\.[\w.-]+/g;

function scrubText(text: string): string {
  return text
    .replace(CIPHERTEXT, REDACTED_VALUE)
    .replace(TWELVE_DIGITS, "[CCCD]");
}

/**
 * Mask an identity number (CCCD/CMND), preserving first 3 and last 2 digits.
 * Example: "001203012345" -> "001***45".
 */
export function maskIdNumber(val: string): string {
  const digits = val.replace(/\s/g, "");
  if (digits.length <= 5) {
    return "***";
  }
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

/**
 * Mask a bank account number, preserving only the last 3 digits.
 * Example: "0451 0003 1234 5678" -> "***678".
 */
export function maskBankAccount(val: string): string {
  const digits = val.replace(/\s/g, "");
  if (digits.length <= 3) {
    return `***${digits}`;
  }
  return `***${digits.slice(-3)}`;
}

/**
 * Sanitize a URL string by redacting sensitive query parameters.
 */
export function sanitizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr, "http://localhost");
    let changed = false;
    for (const [key] of url.searchParams.entries()) {
      if (SENSITIVE_KEY_PATTERN.test(key) || /key|code|auth/i.test(key)) {
        url.searchParams.set(key, REDACTED_VALUE);
        changed = true;
      }
    }
    if (!changed) return urlStr;
    // Return relative or full depending on initial input
    if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
      return url.toString();
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return urlStr;
  }
}

/**
 * Deeply clone and sanitize an error payload or context object.
 * Recursively redacts passwords, tokens, cookies, auth headers,
 * and masks identity / bank numbers.
 */
export function sanitizeErrorPayload<T>(input: T): T {
  const seen = new WeakSet<object>();

  function walk(val: unknown, currentKey?: string): unknown {
    if (val === null || val === undefined) {
      return val;
    }

    // Check if the current object key matches a known sensitive field
    if (currentKey && SENSITIVE_KEY_PATTERN.test(currentKey)) {
      if (typeof val === "string" && currentKey.toLowerCase() === "cookie") {
        const hasSession = /better-auth|session|auth/i.test(val);
        return hasSession
          ? `${REDACTED_VALUE}; hasSession=true`
          : REDACTED_VALUE;
      }
      return REDACTED_VALUE;
    }

    if (currentKey && ID_NUMBER_KEY_PATTERN.test(currentKey)) {
      if (typeof val === "string") {
        return maskIdNumber(val);
      }
    }

    if (currentKey && BANK_ACCOUNT_KEY_PATTERN.test(currentKey)) {
      if (typeof val === "string") {
        return maskBankAccount(val);
      }
      if (typeof val === "number") {
        return maskBankAccount(String(val));
      }
    }

    if (typeof val === "string") {
      const clean = scrubText(val);
      // If it looks like a URL with query params
      if (
        clean.includes("?") &&
        (clean.startsWith("http://") ||
          clean.startsWith("https://") ||
          clean.startsWith("/"))
      ) {
        return sanitizeUrl(clean);
      }
      return clean;
    }

    if (typeof val !== "object") {
      return val;
    }

    // Prevent infinite recursion on circular objects
    if (seen.has(val)) {
      return "[Circular]";
    }
    seen.add(val);

    // Handle Error instances specially
    if (val instanceof Error) {
      const errorObj: Record<string, unknown> = {
        name: val.name,
        message: scrubText(val.message),
        stack: val.stack === undefined ? undefined : scrubText(val.stack),
      };

      if ("digest" in val) {
        errorObj.digest = (val as { digest?: unknown }).digest;
      }
      if ("cause" in val && val.cause !== undefined) {
        errorObj.cause = walk(val.cause);
      }

      // Copy any custom enumerable properties
      for (const [k, v] of Object.entries(val)) {
        if (!(k in errorObj)) {
          errorObj[k] = walk(v, k);
        }
      }

      return errorObj;
    }

    // Handle Arrays
    if (Array.isArray(val)) {
      return val.map((item) => walk(item, currentKey));
    }

    // Handle Plain Objects
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = walk(v, k);
    }
    return result;
  }

  return walk(input) as T;
}
