"use client";

import { Ellipsis } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, type Role } from "@/domain/role";
import { isTempPasswordExpired } from "@/domain/temp-password-expiry";
import { callApi } from "@/lib/api-client";
import type { UserRow, WithTempPassword } from "@/lib/users/service";

import { RoleRadioGroup } from "./role-radio-group";

type Pending = "role" | "reset" | "lock" | "unlock" | null;

interface UserRowActionsProps {
  user: UserRow;
  now?: Date;
  /** `title` heads the temporary-password dialog when one was issued. */
  onDone: (issued?: WithTempPassword, title?: string) => void;
  onError: (message: string) => void;
}

const CONFIRM: Record<
  Exclude<Pending, "role" | null>,
  {
    title: string;
    body: (name: string) => string;
    action: string;
    path: string;
    /** Dialog title when the call returns a temporary password. */
    issuedTitle?: string;
  }
> = {
  reset: {
    title: "Đặt lại mật khẩu?",
    body: (name) =>
      `${name} sẽ bị đăng xuất trên mọi máy và phải đăng nhập bằng mật khẩu tạm mới.`,
    action: "Đặt lại",
    path: "reset-password",
    issuedTitle: "Đã đặt lại mật khẩu",
  },
  lock: {
    title: "Khóa tài khoản?",
    body: (name) =>
      `${name} bị đăng xuất ngay và không đăng nhập được nữa. Lịch sử vẫn giữ nguyên.`,
    action: "Khóa",
    path: "lock",
  },
  unlock: {
    title: "Mở khóa tài khoản?",
    body: (name) =>
      `${name} dùng lại được với mật khẩu tạm mới; mật khẩu cũ không còn dùng được.`,
    action: "Mở khóa",
    path: "unlock",
    issuedTitle: "Đã mở khóa tài khoản",
  },
};

/** Per-row menu of D17 (spec user-management). Not shown on one's own row. */
export function UserRowActions({
  user,
  now,
  onDone,
  onError,
}: UserRowActionsProps) {
  const [open, setOpen] = useState<Pending>(null);
  const [role, setRole] = useState<Role>(user.role);
  const [busy, setBusy] = useState(false);
  const expired = isTempPasswordExpired(user, now);
  const confirm =
    open && open !== "role"
      ? open === "reset" && expired
        ? {
            title: "Cấp lại mật khẩu tạm?",
            body: (name: string) =>
              `${name} sẽ được cấp mật khẩu tạm mới có hiệu lực trong 48 giờ.`,
            action: "Cấp lại",
            path: "reset-password",
            issuedTitle: "Đã cấp lại mật khẩu tạm",
          }
        : CONFIRM[open]
      : null;

  async function run(
    path: string,
    init: { method: string; body?: unknown },
    issuedTitle?: string,
  ) {
    setBusy(true);
    const result = await callApi<{ user: UserRow; tempPassword?: string }>(
      `/api/users/${user.id}${path ? `/${path}` : ""}`,
      init,
    );
    setBusy(false);
    setOpen(null);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    const { tempPassword } = result.data;
    onDone(
      tempPassword ? { user: result.data.user, tempPassword } : undefined,
      issuedTitle,
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={`Thao tác với ${user.name}`}
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {user.status === "ACTIVE" ? (
            <>
              <DropdownMenuItem onSelect={() => setOpen("role")}>
                Đổi vai trò
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOpen("reset")}>
                {expired ? "Cấp lại mật khẩu tạm" : "Đặt lại mật khẩu"}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setOpen("lock")}
              >
                Khóa tài khoản
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => setOpen("unlock")}>
              Mở khóa
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={open === "role"}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
          setRole(user.role);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi vai trò của {user.name}</DialogTitle>
            <DialogDescription>
              Hiện là {ROLE_LABELS[user.role]}. Vai trò mới có hiệu lực ngay ở
              lần tải trang kế tiếp.
            </DialogDescription>
          </DialogHeader>
          <RoleRadioGroup
            value={role}
            onChange={setRole}
            idPrefix={`role-${user.id}`}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Hủy
            </Button>
            <Button
              disabled={busy || role === user.role}
              onClick={() => run("", { method: "PATCH", body: { role } })}
            >
              Lưu vai trò
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.body(user.name)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              variant={open === "lock" ? "destructive" : "default"}
              onClick={(event) => {
                event.preventDefault();
                if (confirm) {
                  void run(
                    confirm.path,
                    { method: "POST" },
                    confirm.issuedTitle,
                  );
                }
              }}
            >
              {confirm?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
