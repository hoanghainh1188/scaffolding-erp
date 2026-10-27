"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface IssuedPassword {
  /** Whose account, for the reminder. */
  name: string;
  password: string;
  /** "Đã tạo tài khoản", "Đã đặt lại mật khẩu"... */
  title: string;
}

interface TempPasswordDialogProps {
  issued: IssuedPassword | null;
  onClose: () => void;
}

/**
 * The temporary password, shown exactly once (spec user-management). Closing
 * drops it from memory; nothing keeps a copy.
 */
export function TempPasswordDialog({
  issued,
  onClose,
}: TempPasswordDialogProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open={issued !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{issued?.title}</DialogTitle>
          <DialogDescription>
            Mật khẩu tạm chỉ hiện một lần. Đóng hộp này là không xem lại được.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 rounded-lg border bg-background p-4">
          <span className="text-label">Mật khẩu tạm</span>
          <div className="flex items-center gap-2">
            <code
              data-testid="temp-password"
              className="flex-1 font-mono text-lg tracking-wider"
            >
              {issued?.password}
            </code>
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Đã chép" : "Sao chép"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Đưa mật khẩu này cho {issued?.name}. Lần đầu đăng nhập phải đổi mật
            khẩu mới.
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            Xong
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
