// Who is signed in, read fresh from the database on every request (D5).
import { parseContractScope, type ContractScope } from "@/domain/permissions";
import type { Role } from "@/domain/role";

import type { Auth } from "./auth";
import { SHORT_SESSION_MS } from "./sign-in";

export interface CurrentUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  /** Which contract types a SALES account works on (0.2 #51). */
  contractScope: ContractScope;
  mustChangePassword: boolean;
  sessionId: string;
}

/**
 * The user behind the request's session cookie, or null. Rejects sessions
 * of locked accounts and unticked sessions older than 12 hours (design D1),
 * whatever Better Auth's own expiry says.
 */
export async function resolveCurrentUser(
  auth: Auth,
  headers: Headers,
  now: Date = new Date(),
): Promise<CurrentUser | null> {
  const found = await auth.api.getSession({ headers });
  if (!found) return null;
  const { user, session } = found;
  if (user.status !== "ACTIVE") return null;
  if (
    !session.persistent &&
    now.getTime() - session.createdAt.getTime() > SHORT_SESSION_MS
  ) {
    return null;
  }
  return {
    id: user.id,
    name: user.name,
    username: user.username ?? "",
    role: user.role as Role,
    contractScope: parseContractScope(user.contractScope),
    mustChangePassword: user.mustChangePassword,
    sessionId: session.id,
  };
}
