import { Bell, ChevronDown, Menu, Plus, Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { CurrentUser } from "@/lib/current-user";

import { UserMenu } from "../user-menu";

const QUICK_CREATE = [
  { label: "Tạo hợp đồng", href: "/sales" },
  { label: "Tạo phiếu thu mua", href: "/purchasing" },
] as const;

/**
 * Search, quick create and notifications are placeholders in setup-project;
 * the screens that own them make them work.
 */
export function TopHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-card px-4 lg:px-6 print:hidden">
      <SidebarTrigger className="size-11 lg:hidden" aria-label="Mở menu">
        <Menu aria-hidden />
      </SidebarTrigger>

      <div className="relative hidden min-w-0 flex-1 md:block md:max-w-md">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Tìm kiếm"
          placeholder="Tìm vật tư, hợp đồng, nhà thầu"
          className="pl-10"
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Tìm kiếm"
      >
        <Search aria-hidden className="size-5" />
      </Button>

      <div className="ml-auto flex min-w-0 items-center gap-1 md:gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Tạo mới" className="max-md:size-11 max-md:px-0">
              <Plus aria-hidden className="size-5" />
              <span className="hidden md:inline">Tạo mới</span>
              <ChevronDown aria-hidden className="hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {QUICK_CREATE.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>{item.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" aria-label="Thông báo">
          <Bell aria-hidden className="size-5" />
        </Button>

        <UserMenu user={user} />
      </div>
    </header>
  );
}
