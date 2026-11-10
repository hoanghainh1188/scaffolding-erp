## MODIFIED Requirements

### Requirement: Error Data Sanitization

The error reporting system MUST sanitize all error payloads before logging or transmission by redacting passwords, secrets, tokens, raw cookies, encryption keys and ciphertext, and masking identity numbers (CCCD) and bank accounts. It MUST also scan string content, not only field names, so a CCCD or ciphertext inside an error message or stack trace does not leave the server.

#### Scenario: Redacting sensitive authentication credentials
- **GIVEN** an error object contains request headers with Cookie or Authorization, and body with `password`
- **WHEN** the error payload is processed through `sanitizeErrorPayload`
- **THEN** all credential fields are replaced with `"[REDACTED]"` and raw tokens are stripped

#### Scenario: Masking personal identity numbers and bank accounts
- **GIVEN** an error context contains an ID number (CCCD) and bank account
- **WHEN** the payload is sanitized
- **THEN** the ID number shows only first 3 and last 2 digits, and the bank account shows only last 3 digits

#### Scenario: CCCD inside an error message
- **GIVEN** an error message `Failed query: insert ... params: 001203012345,Anh Tam`
- **WHEN** the payload is sanitized
- **THEN** the string `001203012345` is replaced with `[CCCD]` in the message and in the stack

#### Scenario: Ciphertext and key fields
- **GIVEN** an error context contains `idNumberEnc` and `PII_ENCRYPTION_KEYS`, and a message contains a value starting with `pii1.`
- **WHEN** the payload is sanitized
- **THEN** both fields are `"[REDACTED]"` and the value in the message is replaced with `[REDACTED]`
