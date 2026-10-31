"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  DataTable,
  type DataTableColumn,
} from "@/components/domain/data-table";
import { ToneBadge } from "@/components/domain/tone-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DEVICE_LABELS, formatLastLogin } from "@/domain/device";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/role";
import { isTempPasswordExpired } from "@/domain/temp-password-expiry";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type {
  UserCounts,
  UserRow,
  WithTempPassword,
} from "@/lib/users/service";

import { AddUserForm } from "./add-user-form";
import { describeCounts } from "./role-info";
import {
  TempPasswordDialog,
  type IssuedPassword,
} from "./temp-password-dialog";
import { UserRowActions } from "./user-row-actions";

interface UsersScreenProps {
  users: UserRow[];
  counts: UserCounts;
  activeRole: Role | null;
  currentUserId: string;
  /** Request time (ISO), so "Hôm nay" matches on server and browser. */
  now: string;
}

/** D17 Người dùng (spec user-management). */
export function UsersScreen({
  users,
  counts,
  activeRole,
  currentUserId,
  now,
}: UsersScreenProps) {
  const router = useRouter();
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const [error, setError] = useState<string | null>(null);

  function show(result: WithTempPassword | undefined, title: string) {
    setError(null);
    if (result) {
      setIssued({
        name: result.user.name,
        password: result.tempPassword,
        title,
      });
    }
    router.refresh();
  }

  const columns = buildColumns({
    currentUserId,
    now: new Date(now),
    onDone: (result, title) => show(result, title ?? "Đã cấp mật khẩu tạm"),
    onError: setError,
  });

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/settings" className="hover:text-foreground">
          Cài đặt
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Người dùng</span>
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Người dùng</h1>
        <p className="text-sm text-muted-foreground">
          {describeCounts(counts)}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section
          aria-labelledby="user-list"
          className="flex min-w-0 flex-[2_1_600px] flex-col gap-4 rounded-xl border bg-card p-5"
        >
          <h2 id="user-list" className="sr-only">
            Danh sách người dùng
          </h2>
          <RoleFilter counts={counts} activeRole={activeRole} />
          <div role="alert" className="empty:hidden">
            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DataTable
            columns={columns}
            data={users}
            label="Danh sách người dùng"
            emptyState={{
              message: "Chưa có ai với vai trò này",
              action: { label: "Xem tất cả", href: "/settings/users" },
            }}
          />
        </section>

        <AddUserForm onCreated={(result) => show(result, "Đã tạo tài khoản")} />
      </div>

      <TempPasswordDialog issued={issued} onClose={() => setIssued(null)} />
    </div>
  );
}

function RoleFilter({
  counts,
  activeRole,
}: {
  counts: UserCounts;
  activeRole: Role | null;
}) {
  const total = counts.active + counts.locked;
  const chips: { label: string; href: string; active: boolean }[] = [
    {
      label: `Tất cả · ${total}`,
      href: "/settings/users",
      active: !activeRole,
    },
    ...ROLES.map((role) => ({
      label: `${ROLE_LABELS[role]} · ${counts.byRole[role]}`,
      href: `/settings/users?role=${role}`,
      active: activeRole === role,
    })),
  ];
  return (
    <nav aria-label="Lọc theo vai trò" className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          aria-current={chip.active ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center rounded-pill border px-3.5 text-sm font-medium",
            chip.active
              ? "border-primary bg-primary font-semibold text-primary-foreground"
              : "bg-card hover:bg-accent",
          )}
        >
          {chip.label}
        </Link>
      ))}
    </nav>
  );
}

interface ColumnOptions {
  currentUserId: string;
  now: Date;
  onDone: (result?: WithTempPassword, title?: string) => void;
  onError: (message: string) => void;
}

function buildColumns({
  currentUserId,
  now,
  onDone,
  onError,
}: ColumnOptions): DataTableColumn<UserRow>[] {
  return [
    {
      id: "name",
      header: "Họ tên",
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <span className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="bg-accent text-caption text-accent-foreground">
              {initials(row.original.name)}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{row.original.name}</span>
            <span className="text-caption text-muted-foreground">
              {row.original.username}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: "role",
      header: "Vai trò",
      accessorFn: (row) => ROLE_LABELS[row.role],
    },
    {
      id: "device",
      header: "Dùng trên",
      accessorFn: (row) =>
        row.lastLoginDevice ? DEVICE_LABELS[row.lastLoginDevice] : "—",
      meta: { hideBelow: "md" },
    },
    {
      id: "lastLogin",
      header: "Đăng nhập gần nhất",
      accessorFn: (row) => row.lastLoginAt ?? "",
      cell: ({ row }) =>
        formatLastLogin(
          row.original.lastLoginAt ? new Date(row.original.lastLoginAt) : null,
          now,
        ),
    },
    {
      id: "status",
      header: "Trạng thái",
      accessorFn: (row) => row.status,
      cell: ({ row }) => {
        if (row.original.status !== "ACTIVE") {
          return <ToneBadge tone="muted">Đã khóa</ToneBadge>;
        }
        if (isTempPasswordExpired(row.original, now)) {
          return <ToneBadge tone="warning">Hết hạn mật khẩu tạm</ToneBadge>;
        }
        return <ToneBadge tone="success">Đang dùng</ToneBadge>;
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) =>
        row.original.id === currentUserId ? (
          <span className="text-caption text-muted-foreground">Bạn</span>
        ) : (
          <UserRowActions
            user={row.original}
            now={now}
            onDone={onDone}
            onError={onError}
          />
        ),
    },
  ];
}
