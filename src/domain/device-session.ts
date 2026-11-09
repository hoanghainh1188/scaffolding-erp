// Devices a user is signed in on (session-management design D6). A "device"
// is one session row. Pure: nothing here sees a token or an address.
import { deviceText, detectBrowser } from "./activity";
import { detectDevice, formatLastLogin } from "./device";

/** "Giữ đăng nhập" not ticked: the session ends 12 h after sign-in. */
export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

export const DEVICE_SESSION_LIST_LIMIT = 50;

export interface DeviceSessionRecord {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  persistent: boolean;
}

export interface DeviceSessionRow {
  id: string;
  deviceName: string;
  signedIn: string;
  lastActive: string;
  isCurrent: boolean;
}

/** How many sessions ended and how many trusted devices were forgotten. */
export interface SignOutCounts {
  sessions: number;
  trusted: number;
}

export function isLiveDeviceSession(
  row: Pick<DeviceSessionRecord, "expiresAt" | "persistent" | "createdAt">,
  now: Date,
): boolean {
  if (row.expiresAt.getTime() <= now.getTime()) return false;
  return (
    row.persistent ||
    now.getTime() - row.createdAt.getTime() <= SHORT_SESSION_MS
  );
}

export function deviceNameOf(userAgent: string | null): string {
  return deviceText(detectDevice(userAgent), detectBrowser(userAgent));
}

/** Live sessions for the page: this device first, then latest activity. */
export function toDeviceSessionRows(
  records: readonly DeviceSessionRecord[],
  currentId: string,
  now: Date,
): DeviceSessionRow[] {
  return records
    .filter((row) => isLiveDeviceSession(row, now))
    .toSorted((a, b) => {
      if (a.id === currentId) return -1;
      if (b.id === currentId) return 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, DEVICE_SESSION_LIST_LIMIT)
    .map((row) => ({
      id: row.id,
      deviceName: deviceNameOf(row.userAgent),
      signedIn: formatLastLogin(row.createdAt, now),
      lastActive: formatLastLogin(row.updatedAt, now),
      isCurrent: row.id === currentId,
    }));
}

/** Nothing changed writes no log row (activity-log spec). */
export function signOutOutcome({ sessions, trusted }: SignOutCounts): {
  log: boolean;
  suffix: string;
} {
  return {
    log: sessions > 0 || trusted > 0,
    suffix: trusted > 0 ? `, quên ${trusted} máy đã tin` : "",
  };
}

export function otherDevicesSummary(counts: SignOutCounts): string {
  return `Đăng xuất ${counts.sessions} máy khác${signOutOutcome(counts).suffix}`;
}

export function allDevicesSummary(
  username: string,
  counts: SignOutCounts,
): string {
  return `Đăng xuất mọi máy của ${username} (${counts.sessions} máy)${signOutOutcome(counts).suffix}`;
}
