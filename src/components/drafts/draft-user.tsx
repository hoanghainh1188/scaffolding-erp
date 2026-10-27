import { getCurrentUser } from "@/lib/current-user";

import { OutboxRunner } from "./outbox-runner";

/** Starts the outbox for whoever is signed in (inside <Suspense>). */
export async function DraftUser() {
  const user = await getCurrentUser();
  return user ? <OutboxRunner userId={user.id} /> : null;
}
