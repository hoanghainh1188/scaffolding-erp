import crypto from "node:crypto";

/**
 * Generate a cryptographically secure random base64 nonce.
 */
export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export interface BuildCspOptions {
  nonce: string;
  isDev?: boolean;
}

/**
 * Build Content-Security-Policy header string with nonce and strict-dynamic.
 */
export function buildCspHeader({
  nonce,
  isDev = process.env.NODE_ENV === "development",
}: BuildCspOptions): string {
  const scriptDirectives = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    isDev ? "'unsafe-eval'" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const directives = [
    "default-src 'self'",
    `script-src ${scriptDirectives}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    !isDev && process.env.E2E !== "1" ? "upgrade-insecure-requests" : null,
  ]
    .filter(Boolean)
    .join("; ");

  return directives;
}
