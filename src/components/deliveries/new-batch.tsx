"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { BatchForm, type BatchInitial } from "./batch-form";

type FormProps = Omit<Parameters<typeof BatchForm>[0], "onDone" | "initial">;

/** The "Tạo đợt xuất" button of D6, or "Sửa" of a PLANNED note. */
export function BatchDialog({
  label,
  title,
  initial,
  ...form
}: FormProps & { label: string; title: string; initial?: BatchInitial }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={initial ? "outline" : "default"}
        onClick={() => setOpen(true)}
      >
        {initial ? null : <Plus aria-hidden />} {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Bộ tự tách thành linh kiện. Chỉ xuất mã có trên hợp đồng; thủ kho
              nhặt trên điện thoại rồi xác nhận xe rời bãi thì mới ghi sổ.
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <BatchForm
              {...form}
              initial={initial}
              onDone={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
