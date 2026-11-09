import {
  KeyRound,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { can, canManageTwoFactor } from "@/domain/permissions";
import { ROLE_LABELS, type Role } from "@/domain/role";
import { signOutAction } from "@/lib/auth/actions";
import {
  CHANGE_PASSWORD_PATH,
  SESSIONS_PATH,
  TWO_FACTOR_PATH,
} from "@/lib/auth/paths";
import { isDemoMode } from "@/lib/env";
import { initials } from "@/lib/initials";
import { dict } from "@/locales";

interface UserMenuProps {
  user: { name: string; username: string; role: Role; systemAdmin?: boolean };
}

/** Header user area: who is signed in, change password, sign out. */
export function UserMenu({ user }: UserMenuProps) {
  const account = { role: user.role, systemAdmin: user.systemAdmin ?? false };
  const showTwoFactor = canManageTwoFactor(account) && !isDemoMode();
  // A director reaches D17 from the sidebar; an admin of another role cannot.
  const showAdminLink = account.systemAdmin && !can(user.role, "users.manage");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-11 min-w-0 items-center gap-3 rounded-md pr-2 pl-1 outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Avatar className="size-10" aria-hidden>
          <AvatarFallback className="bg-accent text-label text-accent-foreground">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        {/* Named by its visible text; below sm only the avatar shows. */}
        <span className="sr-only sm:hidden">
          {user.name}, {ROLE_LABELS[user.role]}
        </span>
        <span className="hidden min-w-0 flex-col text-left sm:flex">
          <span className="truncate text-label">{user.name}</span>
          <span className="truncate text-caption text-muted-foreground">
            {ROLE_LABELS[user.role]}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span>{user.name}</span>
          <span className="text-caption font-normal text-muted-foreground">
            {user.username} · {ROLE_LABELS[user.role]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={CHANGE_PASSWORD_PATH}>
            <KeyRound aria-hidden />
            Đổi mật khẩu
          </Link>
        </DropdownMenuItem>
        {showTwoFactor ? (
          <DropdownMenuItem asChild>
            <Link href={TWO_FACTOR_PATH}>
              <ShieldCheck aria-hidden />
              {dict.auth.twoFactor.menu}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={SESSIONS_PATH}>
            <MonitorSmartphone aria-hidden />
            {dict.auth.sessions.menu}
          </Link>
        </DropdownMenuItem>
        {showAdminLink ? (
          <DropdownMenuItem asChild>
            <Link href="/settings/users">
              <UserCog aria-hidden />
              {dict.auth.twoFactor.menuAdmin}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden />
              Đăng xuất
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
