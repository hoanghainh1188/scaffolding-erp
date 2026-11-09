"use client";

import { Ellipsis } from "lucide-react";
import { useState, type FormEvent } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  CONTRACT_SCOPE_LABELS,
  type ContractScope,
} from "@/domain/permissions";
import { ROLE_LABELS, type Role } from "@/domain/role";
import { isTempPasswordExpired } from "@/domain/temp-password-expiry";
import { callApi } from "@/lib/api-client";
import type { UserRow, WithTempPassword } from "@/lib/users/service";
import { dict } from "@/locales";

import { ContractScopeRadioGroup } from "./contract-scope-radio-group";
import { RoleRadioGroup } from "./role-radio-group";

const TWO_FACTOR = dict.auth.twoFactor;
const SESSIONS = dict.auth.sessions;

type Pending =
  | "role"
  | "scope"
  | "reset"
  | "lock"
  | "unlock"
  | "twoFactor"
  | "signOutAll"
  | null;

interface UserRowActionsProps {
  user: UserRow;
  now?: Date;
  /** Off for an admin who is not a director: only the 2FA reset is left. */
  canManageUsers?: boolean;
  canResetTwoFactor?: boolean;
  /** `title` heads the temporary-password dialog when one was issued. */
  onDone: (issued?: WithTempPassword, title?: string) => void;
  onError: (message: string) => void;
  onNotice?: (message: string) => void;
}

const CONFIRM: Record<
  Exclude<Pending, "role" | "scope" | "twoFactor" | "signOutAll" | null>,
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
  canManageUsers = true,
  canResetTwoFactor = false,
  onDone,
  onError,
  onNotice,
}: UserRowActionsProps) {
  const [open, setOpen] = useState<Pending>(null);
  const [role, setRole] = useState<Role>(user.role);
  const [scope, setScope] = useState<ContractScope>(user.contractScope);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const showReset = canResetTwoFactor && user.twoFactorEnabled;
  const expired = isTempPasswordExpired(user, now);
  const confirm =
    open &&
    open !== "role" &&
    open !== "scope" &&
    open !== "twoFactor" &&
    open !== "signOutAll"
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

  async function signOutAll() {
    setBusy(true);
    const result = await callApi<{ count: number; forgotten: number }>(
      `/api/users/${user.id}/sign-out-all`,
      { method: "POST" },
    );
    setBusy(false);
    setOpen(null);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onNotice?.(
      SESSIONS.allResult(
        user.username,
        result.data.count,
        result.data.forgotten,
      ),
    );
  }

  async function resetTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setDialogError(null);
    const result = await callApi<{ reset: true }>(
      `/api/users/${user.id}/two-factor/reset`,
      {
        method: "POST",
        body: {
          password: String(form.get("password")),
          code: String(form.get("code")),
        },
      },
    );
    setBusy(false);
    if (!result.ok) {
      setDialogError(result.error);
      return;
    }
    setOpen(null);
    onDone();
  }

  if (!canManageUsers && !showReset) return null;

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
          {showReset ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setOpen("twoFactor")}
            >
              {TWO_FACTOR.resetItem}
            </DropdownMenuItem>
          ) : null}
          {!canManageUsers ? null : user.status === "ACTIVE" ? (
            <>
              <DropdownMenuItem onSelect={() => setOpen("role")}>
                Đổi vai trò
              </DropdownMenuItem>
              {user.role === "SALES" ? (
                <DropdownMenuItem onSelect={() => setOpen("scope")}>
                  Đổi phạm vi hợp đồng
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => setOpen("reset")}>
                {expired ? "Cấp lại mật khẩu tạm" : "Đặt lại mật khẩu"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOpen("signOutAll")}>
                {SESSIONS.allItem}
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
        open={open === "twoFactor"}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(null);
            setDialogError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TWO_FACTOR.resetTitle(user.name)}</DialogTitle>
            <DialogDescription>
              {TWO_FACTOR.resetBody(user.name)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={resetTwoFactor} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`tf-password-${user.id}`}>
                {TWO_FACTOR.adminPassword}
              </Label>
              <Input
                id={`tf-password-${user.id}`}
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`tf-code-${user.id}`}>
                {TWO_FACTOR.adminCode}
              </Label>
              <Input
                id={`tf-code-${user.id}`}
                name="code"
                required
                autoComplete="one-time-code"
              />
            </div>
            <div role="alert" className="empty:hidden">
              {dialogError ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {dialogError}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(null)}
              >
                {TWO_FACTOR.cancel}
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                {TWO_FACTOR.resetAction}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

      <Dialog
        open={open === "scope"}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
          setScope(user.contractScope);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Phạm vi hợp đồng của {user.name}</DialogTitle>
            <DialogDescription>
              Hiện là {CONTRACT_SCOPE_LABELS[user.contractScope]}. Phạm vi mới
              có hiệu lực ngay ở lần tải trang kế tiếp.
            </DialogDescription>
          </DialogHeader>
          <ContractScopeRadioGroup
            value={scope}
            onChange={setScope}
            idPrefix={`scope-${user.id}`}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Hủy
            </Button>
            <Button
              disabled={busy || scope === user.contractScope}
              onClick={() =>
                run("", { method: "PATCH", body: { contractScope: scope } })
              }
            >
              Lưu phạm vi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={open === "signOutAll"}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{SESSIONS.allTitle(user.name)}</AlertDialogTitle>
            <AlertDialogDescription>
              {SESSIONS.allBody(user.name)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            {SESSIONS.allLeakedBefore}
            <button
              type="button"
              className="underline"
              onClick={() => setOpen("reset")}
            >
              {SESSIONS.allLeakedLink}
            </button>
            {SESSIONS.allLeakedAfter}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>{SESSIONS.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                void signOutAll();
              }}
            >
              {SESSIONS.allItem}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
