# error-monitoring Specification

## Purpose
TBD - created by archiving change error-monitoring. Update Purpose after archive.

## Requirements

### Requirement: Error Data Sanitization

The error reporting system MUST sanitize all error payloads before logging or transmission by redacting passwords, secrets, tokens, raw cookies, and masking identity numbers (CCCD) and bank accounts.

#### Scenario: Redacting sensitive authentication credentials
- **GIVEN** an error object contains request headers with Cookie or Authorization, and body with `password`
- **WHEN** the error payload is processed through `sanitizeErrorPayload`
- **THEN** all credential fields are replaced with `"[REDACTED]"` and raw tokens are stripped

#### Scenario: Masking personal identity numbers and bank accounts
- **GIVEN** an error context contains an ID number (CCCD) and bank account
- **WHEN** the payload is sanitized
- **THEN** the ID number shows only first 3 and last 2 digits, and the bank account shows only last 3 digits

### Requirement: Server Error Capture via Instrumentation

The server MUST capture unhandled server-side exceptions using Next.js `onRequestError` in `instrumentation.ts` and dispatch sanitized error reports to the configured monitoring sink.

#### Scenario: Server error captured during route execution
- **GIVEN** an unhandled exception occurs inside a server component or route handler
- **WHEN** Next.js triggers `onRequestError`
- **THEN** the error details, path, and method are extracted, sanitized, and reported

### Requirement: Client Error Reporting

The client application MUST capture unhandled JavaScript exceptions and promise rejections in the browser and report sanitized error details to `/api/telemetry/errors`.

#### Scenario: Uncaught browser error reported
- **GIVEN** an uncaught runtime error occurs on the client browser
- **WHEN** the browser triggers `error` or `unhandledrejection`
- **THEN** the client reporter dispatches a sanitized payload to `/api/telemetry/errors`

### Requirement: Content Security Policy Adaptation

The CSP header generator MUST allow connections to the configured remote monitoring endpoint in `connect-src` when error monitoring is enabled, while preserving strict nonce protection.

#### Scenario: Monitoring host allowed in CSP connect-src
- **GIVEN** error monitoring is configured with a remote DSN host
- **WHEN** `buildCspHeader` is called
- **THEN** `connect-src` includes the remote host alongside `'self'`
