import { DomainValueError } from "./errors";
import { toSearchText } from "./search-text";

// The 34 provinces after the 2025 merger (in force since 01/07/2025) and the
// region each belongs to (requirements 0.2 #46, catalog-extensions design D4).
// The region is never stored: it always follows the province. Changing this
// table needs no migration.
export const REGIONS = ["NORTH", "CENTRAL", "SOUTH"] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_LABELS: Readonly<Record<Region, string>> = {
  NORTH: "Miền Bắc",
  CENTRAL: "Miền Trung",
  SOUTH: "Miền Nam",
};

/** Sites created before provinces existed have none: region "Chưa rõ". */
export const UNKNOWN_REGION_LABEL = "Chưa rõ";

export interface Province {
  readonly code: string;
  readonly name: string;
  readonly region: Region;
}

const north = (code: string, name: string): Province => ({
  code,
  name,
  region: "NORTH",
});
const central = (code: string, name: string): Province => ({
  code,
  name,
  region: "CENTRAL",
});
const south = (code: string, name: string): Province => ({
  code,
  name,
  region: "SOUTH",
});

export const PROVINCES: readonly Province[] = [
  north("HN", "Hà Nội"),
  north("HP", "Hải Phòng"),
  north("QNI", "Quảng Ninh"),
  north("BNI", "Bắc Ninh"),
  north("HY", "Hưng Yên"),
  north("NB", "Ninh Bình"),
  north("PT", "Phú Thọ"),
  north("TN", "Thái Nguyên"),
  north("TQ", "Tuyên Quang"),
  north("LCI", "Lào Cai"),
  north("LS", "Lạng Sơn"),
  north("CB", "Cao Bằng"),
  north("DB", "Điện Biên"),
  north("LCH", "Lai Châu"),
  north("SL", "Sơn La"),
  central("TH", "Thanh Hóa"),
  central("NA", "Nghệ An"),
  central("HT", "Hà Tĩnh"),
  central("QT", "Quảng Trị"),
  central("HUE", "Huế"),
  central("DNG", "Đà Nẵng"),
  central("QNG", "Quảng Ngãi"),
  central("GL", "Gia Lai"),
  central("DL", "Đắk Lắk"),
  central("KH", "Khánh Hòa"),
  central("LD", "Lâm Đồng"),
  south("HCM", "TP. Hồ Chí Minh"),
  south("DNI", "Đồng Nai"),
  south("TNI", "Tây Ninh"),
  south("CT", "Cần Thơ"),
  south("VL", "Vĩnh Long"),
  south("DT", "Đồng Tháp"),
  south("AG", "An Giang"),
  south("CM", "Cà Mau"),
];

export const PROVINCE_MESSAGES = {
  required: "Chọn tỉnh/thành của công trình",
  invalid: "Tỉnh/thành không hợp lệ",
} as const;

const byCode = new Map(PROVINCES.map((province) => [province.code, province]));
const byName = new Map(
  PROVINCES.map((province) => [toSearchText(province.name), province]),
);

export function findProvince(code: string | null | undefined): Province | null {
  return code ? (byCode.get(code) ?? null) : null;
}

export function regionOf(code: string | null | undefined): Region | null {
  return findProvince(code)?.region ?? null;
}

export function provincesIn(region: Region): readonly Province[] {
  return PROVINCES.filter((province) => province.region === region);
}

export function isRegion(value: unknown): value is Region {
  return (REGIONS as readonly unknown[]).includes(value);
}

/** "HCM", "hcm" or "TP. Hồ Chí Minh" → "HCM"; anything else is refused. */
export function parseProvince(input: string | null | undefined): string {
  const text = (input ?? "").trim();
  if (!text) throw new DomainValueError(PROVINCE_MESSAGES.required);
  const found =
    byCode.get(text.toUpperCase()) ?? byName.get(toSearchText(text));
  if (!found) throw new DomainValueError(PROVINCE_MESSAGES.invalid);
  return found.code;
}

/** A region filter from a URL: a region, "UNKNOWN" (no province) or none. */
export function parseRegionFilter(
  value: string | null | undefined,
): Region | "UNKNOWN" | undefined {
  if (value === "UNKNOWN") return value;
  return isRegion(value) ? value : undefined;
}

/** A province filter from a URL: a known code or none. */
export function parseProvinceFilter(
  value: string | null | undefined,
): string | undefined {
  return findProvince(value)?.code;
}
