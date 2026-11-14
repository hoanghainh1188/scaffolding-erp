"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Stepper } from "@/components/domain/stepper";
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
import { DomainValueError } from "@/domain/errors";
import { parseItemCode } from "@/domain/item-code";
import { kitTotals } from "@/domain/kit";
import { toMoney } from "@/domain/money";
import { quantityFromDb, toQuantity } from "@/domain/quantity";
import type { ItemRow } from "@/lib/catalog/items";
import type { KitRow } from "@/lib/catalog/kits";

import { ConfirmAction } from "./confirm-action";
import { FormError } from "./form-error";
import { formatPrice, formatWeightMilli } from "./format";
import { useCatalogAction } from "./use-catalog-action";

interface KitEditorDialogProps {
  /** Active items counted in pieces: the only possible parts. */
  parts: ItemRow[];
  kit?: KitRow;
  trigger: ReactNode;
}

interface Line {
  itemId: string;
  quantity: number;
}

/** Create or edit a kit: parts, counts, live weight and rent (design D2). */
export function KitEditorDialog({ parts, kit, trigger }: KitEditorDialogProps) {
  const editing = kit !== undefined;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(kit?.code ?? "");
  const [name, setName] = useState(kit?.name ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Line[]>(
    kit?.components.map(({ itemId, quantity }) => ({ itemId, quantity })) ?? [
      { itemId: parts[0]?.id ?? "", quantity: 1 },
    ],
  );
  const action = useCatalogAction();
  const archive = useCatalogAction();

  const byId = new Map(parts.map((part) => [part.id, part]));
  const known = lines.filter((line) => byId.has(line.itemId));
  const totals = kitTotals(
    known.map((line) => {
      const part = byId.get(line.itemId);
      return {
        quantity: line.quantity,
        standardWeightKg: quantityFromDb(part?.standardWeightKg ?? "0", "KG"),
        dailyRentalPrice:
          part?.dailyRentalPrice == null
            ? null
            : toMoney(part.dailyRentalPrice),
      };
    }),
  );

  const setLine = (index: number, change: Partial<Line>) =>
    setLines(
      lines.map((line, at) => (at === index ? { ...line, ...change } : line)),
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    let body: Record<string, unknown>;
    try {
      body = {
        name,
        components: lines,
        ...(editing ? {} : { code: parseItemCode(code) }),
      };
    } catch (cause: unknown) {
      if (cause instanceof DomainValueError) {
        action.setError(cause.message);
        return;
      }
      throw cause;
    }
    const saved = await action.run(
      editing ? `/api/catalog/kits/${kit.id}` : "/api/catalog/kits",
      { method: editing ? "PATCH" : "POST", body },
    );
    if (saved) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Sửa bộ ${kit.code}` : "Thêm bộ"}
          </DialogTitle>
          <DialogDescription>
            Bộ gồm ít nhất 2 linh kiện tính theo cái. Trọng lượng và giá thuê
            tính từ linh kiện.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {editing ? null : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kit-code" required>
                Mã bộ
              </Label>
              <Input
                id="kit-code"
                value={code}
                required
                aria-invalid={fieldErrors.code ? true : undefined}
                onChange={(event) => {
                  const next = event.target.value.toUpperCase();
                  setCode(next);
                  if (fieldErrors.code && next.trim() !== "") {
                    setFieldErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.code;
                      return copy;
                    });
                  }
                }}
                onBlur={() => {
                  try {
                    parseItemCode(code);
                    setFieldErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.code;
                      return copy;
                    });
                  } catch (cause: unknown) {
                    if (cause instanceof DomainValueError) {
                      setFieldErrors((prev) => ({
                        ...prev,
                        code: cause.message,
                      }));
                    }
                  }
                }}
                placeholder="VD: BO-17"
              />
              {fieldErrors.code && action.error !== fieldErrors.code && (
                <p className="text-caption text-destructive">
                  {fieldErrors.code}
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kit-name" required>
              Tên bộ
            </Label>
            <Input
              id="kit-name"
              value={name}
              required
              aria-invalid={fieldErrors.name ? true : undefined}
              onChange={(event) => {
                setName(event.target.value);
                if (fieldErrors.name && event.target.value.trim() !== "") {
                  setFieldErrors((prev) => {
                    const copy = { ...prev };
                    delete copy.name;
                    return copy;
                  });
                }
              }}
              onBlur={(event) => {
                if (event.target.value.trim() === "") {
                  setFieldErrors((prev) => ({
                    ...prev,
                    name: "Vui lòng nhập tên bộ",
                  }));
                }
              }}
            />
            {fieldErrors.name && action.error !== fieldErrors.name && (
              <p className="text-caption text-destructive">
                {fieldErrors.name}
              </p>
            )}
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-label after:ml-0.5 after:text-destructive after:content-['*']">
              Linh kiện
            </legend>
            {lines.map((line, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Linh kiện ${index + 1}`}
                  value={line.itemId}
                  onChange={(event) =>
                    setLine(index, { itemId: event.target.value })
                  }
                  className="h-11 min-w-0 flex-1 basis-48 rounded-md border border-input bg-card px-3 text-base"
                >
                  {parts.map((part) => (
                    <option key={part.id} value={part.id}>
                      {part.code} · {part.name}
                    </option>
                  ))}
                </select>
                <Stepper
                  label={`Số lượng linh kiện ${index + 1}`}
                  value={toQuantity(line.quantity * 1000, "PIECE")}
                  onValueChange={(value) =>
                    setLine(index, { quantity: value.milli / 1000 })
                  }
                  min={1}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Bỏ linh kiện ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines(lines.filter((_, at) => at !== index))
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() =>
                setLines([
                  ...lines,
                  { itemId: parts[0]?.id ?? "", quantity: 1 },
                ])
              }
            >
              <Plus aria-hidden />
              Thêm linh kiện
            </Button>
          </fieldset>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-background p-3 text-sm">
            <dt className="text-muted-foreground">Trọng lượng 1 bộ</dt>
            <dd className="text-right">
              {formatWeightMilli(totals.weight.milli)}
            </dd>
            <dt className="text-muted-foreground">Giá thuê 1 bộ / ngày</dt>
            <dd className="text-right">
              {totals.rentalPerDay === null
                ? "Không cho thuê"
                : formatPrice(totals.rentalPerDay)}
            </dd>
          </dl>
          <FormError message={action.error} />
          <DialogFooter className="flex-wrap gap-2">
            {editing ? (
              <ConfirmAction
                trigger={
                  <Button type="button" variant="outline">
                    {kit.status === "ACTIVE" ? "Ngừng dùng bộ" : "Dùng lại bộ"}
                  </Button>
                }
                title={
                  kit.status === "ACTIVE"
                    ? `Ngừng dùng ${kit.code}?`
                    : `Dùng lại ${kit.code}?`
                }
                description="Bộ ngừng dùng không chọn được khi báo giá."
                confirmLabel={
                  kit.status === "ACTIVE" ? "Ngừng dùng" : "Dùng lại"
                }
                error={archive.error}
                onConfirm={async () => {
                  const done = await archive.run(
                    `/api/catalog/kits/${kit.id}`,
                    {
                      method: "PATCH",
                      body: {
                        status: kit.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE",
                      },
                    },
                  );
                  if (done !== null) setOpen(false);
                  return done !== null;
                }}
              />
            ) : null}
            <Button type="submit" disabled={action.pending}>
              {action.pending ? "Đang lưu…" : editing ? "Lưu bộ" : "Thêm bộ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
