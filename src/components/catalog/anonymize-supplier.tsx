"use client";

import { useState, type FormEvent } from "react";

import { DateInput } from "@/components/domain/date-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { FormError } from "./form-error";
import { useCatalogAction } from "./use-catalog-action";

interface AnonymizeSupplierProps {
  id: string;
  code: string;
  today: string;
}

/**
 * "Ẩn danh theo yêu cầu" of D16 (personal-data-protection D7). Cannot be
 * undone, so the dialog asks for the seller's code and the request date; the
 * server checks every rule.
 */
export function AnonymizeSupplier({ id, code, today }: AnonymizeSupplierProps) {
  const [open, setOpen] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [requestedOn, setRequestedOn] = useState("");
  const action = useCatalogAction();

  function onOpenChange(next: boolean) {
    setOpen(next);
    action.setError(null);
    setCodeError(null);
    if (!next) {
      setConfirmCode("");
      setRequestedOn("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await action.run(`/api/catalog/suppliers/${id}/anonymize`, {
      method: "POST",
      body: { confirmCode, requestedOn },
    });
    if (saved) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Ẩn danh theo yêu cầu</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ẩn danh {code}</DialogTitle>
          <DialogDescription>
            Tên thật, điện thoại, địa chỉ, mã số thuế, CCCD, tài khoản và ghi
            chú bị xóa khỏi phần mềm. Mã {code} và mọi chứng từ giữ nguyên.
            Người bán đã nhập hàng thì tên, địa chỉ, CCCD được giữ trong hồ sơ
            thuế mã hóa tới hết thời hạn. Không hoàn tác được.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="anonymize-code" required>
              Nhập mã {code} để xác nhận
            </Label>
            <Input
              id="anonymize-code"
              value={confirmCode}
              required
              aria-invalid={codeError ? true : undefined}
              onChange={(event) => {
                setConfirmCode(event.target.value);
                if (codeError && event.target.value.trim() !== "") {
                  setCodeError(null);
                }
              }}
              onBlur={(event) => {
                if (event.target.value.trim() === "") {
                  setCodeError(`Vui lòng nhập mã ${code}`);
                }
              }}
              autoComplete="off"
            />
            {codeError && !action.error && (
              <p className="text-caption text-destructive">{codeError}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="anonymize-date" required>
              Ngày nhận yêu cầu
            </Label>
            <DateInput
              id="anonymize-date"
              required
              value={requestedOn}
              onValueChange={setRequestedOn}
              max={today}
            />
          </div>
          <FormError message={action.error} />
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={action.pending}
            >
              {action.pending ? "Đang ẩn danh…" : "Ẩn danh"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
