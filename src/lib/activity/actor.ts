// Who does an action, as the activity log records it (activity-log design
// D4): the user, their role at that moment, and the device and browser of
// the request. Route handlers get it from withAuth; seeds and tests build
// one with systemActor.
import { detectBrowser, type Browser } from "@/domain/activity";
import { detectDevice, type Device } from "@/domain/device";
import { parseRole, type Role } from "@/domain/role";
import type { Database } from "@/db/client";

export interface ActivityActor {
  id: string;
  role: Role;
  device: Device;
  browser: Browser;
}

/** The actor behind a request: role read from the database this request. */
export function actorFromRequest(
  user: { id: string; role: Role },
  headers: Headers,
): ActivityActor {
  const agent = headers.get("user-agent");
  return {
    id: user.id,
    role: user.role,
    device: detectDevice(agent),
    browser: detectBrowser(agent),
  };
}

/** For seeds, scripts and tests: a computer with an unknown browser. */
export function systemActor(
  user: { id: string; role: Role },
  device: { device?: Device; browser?: Browser } = {},
): ActivityActor {
  return {
    id: user.id,
    role: user.role,
    device: device.device ?? "DESKTOP",
    browser: device.browser ?? "OTHER",
  };
}

/** A seed or test account by login name, as an actor; undefined if absent. */
export async function actorByUsername(
  db: Database,
  username: string,
): Promise<ActivityActor | undefined> {
  const row = await db.query.user.findFirst({
    where: (entry, { eq }) => eq(entry.username, username),
    columns: { id: true, role: true },
  });
  return row
    ? systemActor({ id: row.id, role: parseRole(row.role) })
    : undefined;
}
