import { ChevronRight, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { UnderConstruction } from "@/components/shell/placeholder-page";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Cài đặt" };

export default async function Page() {
  await requirePermission("settings.view");
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1">Cài đặt</h1>
      <Link
        href="/settings/users"
        className="flex max-w-xl items-center gap-4 rounded-lg border bg-card p-5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Users aria-hidden className="size-5" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-label">Người dùng</span>
          <span className="text-body text-muted-foreground">
            Thêm người, đổi vai trò, đặt lại mật khẩu, khóa tài khoản.
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
      </Link>
      <UnderConstruction description="Các cài đặt khác của công ty làm ở change sau." />
    </div>
  );
}
