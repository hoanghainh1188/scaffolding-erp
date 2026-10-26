/**
 * A business value broke a domain rule (money not whole, bad quantity, ...).
 * The message is Vietnamese and safe to show to the user as is.
 */
export class DomainValueError extends Error {
  override readonly name = "DomainValueError";
}
