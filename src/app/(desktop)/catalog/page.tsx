import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/guard";

/** "Danh mục" opens D9; D16 is one link away (master-data design D13). */
export default async function Page() {
  await requirePermission("catalog.view");
  redirect("/catalog/items");
}
