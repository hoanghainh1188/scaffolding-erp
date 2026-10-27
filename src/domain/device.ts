import { formatDateTime, toBusinessDate } from "./business-date";

export const DEVICES = ["DESKTOP", "MOBILE"] as const;
export type Device = (typeof DEVICES)[number];

export const DEVICE_LABELS: Readonly<Record<Device, string>> = {
  DESKTOP: "Máy tính",
  MOBILE: "Điện thoại",
};

const MOBILE_AGENT = /Mobi|Android|iPhone|iPod/i;

/**
 * Phone or computer, from the browser's User-Agent (design D9). New iPads
 * report themselves as a Mac and count as a computer; that is accepted.
 */
export function detectDevice(userAgent: string | null | undefined): Device {
  return userAgent && MOBILE_AGENT.test(userAgent) ? "MOBILE" : "DESKTOP";
}

export function isDevice(value: string): value is Device {
  return (DEVICES as readonly string[]).includes(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * D17 "Đăng nhập gần nhất" in Vietnam time: "Hôm nay, 06:48",
 * "Hôm qua, 17:40" or "23/10/2026, 16:20".
 */
export function formatLastLogin(at: Date | null, now: Date): string {
  if (at === null) return "Chưa đăng nhập";
  const [date = "", time = ""] = formatDateTime(at).split(" ");
  const day = toBusinessDate(at);
  // Vietnam has no daylight saving: 24 hours back is always yesterday.
  if (day === toBusinessDate(now)) return `Hôm nay, ${time}`;
  if (day === toBusinessDate(new Date(now.getTime() - DAY_MS))) {
    return `Hôm qua, ${time}`;
  }
  return `${date}, ${time}`;
}
