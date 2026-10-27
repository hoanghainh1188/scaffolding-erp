import { KeyRound, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/domain/role";
import { signOutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/guard";
import { CHANGE_PASSWORD_PATH } from "@/lib/auth/paths";
import { initials } from "@/lib/initials";

export const metadata: Metadata = { title: "Cá nhân" };

/** Tab Cá nhân: who is signed in, change password, sign out (spec auth). */
export default async function Page() {
  const user = await requireUser();
  return (
    <MobilePage title="Cá nhân">
      <section className="flex items-center gap-4 rounded-lg border bg-card p-4">
        <Avatar className="size-14">
          <AvatarFallback className="bg-accent text-h2 text-accent-foreground">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <dl className="flex min-w-0 flex-col">
          <dt className="sr-only">Họ tên</dt>
          <dd className="truncate text-h2">{user.name}</dd>
          <dt className="sr-only">Tên đăng nhập</dt>
          <dd className="truncate text-body text-muted-foreground">
            {user.username}
          </dd>
          <dt className="sr-only">Vai trò</dt>
          <dd className="text-label">{ROLE_LABELS[user.role]}</dd>
        </dl>
      </section>

      <div className="flex flex-col gap-3">
        <Button
          asChild
          variant="outline"
          size="lg"
          className="h-12 justify-start"
        >
          <Link href={CHANGE_PASSWORD_PATH}>
            <KeyRound aria-hidden />
            Đổi mật khẩu
          </Link>
        </Button>
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="outline"
            size="lg"
            className="h-12 w-full justify-start text-destructive"
          >
            <LogOut aria-hidden />
            Đăng xuất
          </Button>
        </form>
      </div>
    </MobilePage>
  );
}
