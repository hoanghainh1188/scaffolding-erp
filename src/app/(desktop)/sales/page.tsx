import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/guard";

/** "Cho thuê & Bán" opens on the contracts (D4). */
export default async function Page() {
  await requirePermission("sales.view");
  redirect("/sales/contracts");
}
