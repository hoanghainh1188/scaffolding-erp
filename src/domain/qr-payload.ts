// What a QR label says (goods-receipt design D2, master-data D8): the item
// code itself, "GG-K17". A link carrying ?code=GG-K17 is read too, so labels
// printed later as links (#40) still scan.
import { DomainValueError } from "./errors";
import { isValidCatalogCode, normalizeCatalogCode } from "./item-code";

export const QR_MESSAGES = {
  notItem: "Mã QR này không phải mã hàng",
} as const;

function codeFromUrl(text: string): string | null {
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    return new URL(text).searchParams.get("code");
  } catch {
    return null;
  }
}

/** The item code a scan carries, or a DomainValueError. */
export function itemCodeFromQr(raw: string): string {
  const text = raw.trim();
  const code = normalizeCatalogCode(codeFromUrl(text) ?? text);
  if (!isValidCatalogCode(code)) {
    throw new DomainValueError(QR_MESSAGES.notItem);
  }
  return code;
}
