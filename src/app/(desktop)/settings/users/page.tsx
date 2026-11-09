import type { Metadata } from "next";

import { UsersScreen } from "@/components/users/users-screen";
import { getDatabase } from "@/db/client";
import { can, canResetOthersTwoFactor } from "@/domain/permissions";
import { isRole } from "@/domain/role";
import { requirePermission } from "@/lib/auth/guard";
import { listUsers } from "@/lib/users/service";

export const metadata: Metadata = { title: "Người dùng" };

interface UsersPageProps {
  searchParams: Promise<{ role?: string | string[] }>;
}

/** D17 Người dùng & Vai trò: Giám đốc only. */
export default async function Page({ searchParams }: UsersPageProps) {
  const viewer = await requirePermission("users.manage", {
    orSystemAdmin: true,
  });
  const { role } = await searchParams;
  const activeRole = typeof role === "string" && isRole(role) ? role : null;
  const { users, counts } = await listUsers(getDatabase(), {
    role: activeRole ?? undefined,
  });
  return (
    <UsersScreen
      users={users}
      counts={counts}
      activeRole={activeRole}
      currentUserId={viewer.id}
      canManageUsers={can(viewer.role, "users.manage")}
      canResetTwoFactor={canResetOthersTwoFactor(viewer)}
      now={new Date().toISOString()}
    />
  );
}
