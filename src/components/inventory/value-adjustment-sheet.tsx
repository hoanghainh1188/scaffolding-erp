"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { FormError } from "@/components/catalog/form-error";
import { useCatalogAction } from "@/components/catalog/use-catalog-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  CONDITION_LABELS,
  CONDITIONS,
  type Condition,
} from "@/domain/condition";
import { DomainValueError } from "@/domain/errors";
import { parseMoney } from "@/domain/money";
import { callApi } from "@/lib/api-client";
import type { AdjustmentDetail } from "@/lib/inventory/adjustments";

import type { ItemOption } from "./adjustment-form-sheet";
import { formatValuePreview, type ValuePreviewView } from "./format";

interface DraftLine {
  key: number;
  itemId: string;
  condition: Condition;
  direction: "UP" | "DOWN";
  amount: string;
}

interface ValueAdjustmentSheetProps {
  items: ItemOption[];
  /** Editing this draft; absent to create one. */
  adjustment?: AdjustmentDetail;
  trigger?: ReactNode;
  defaultOpen?: boolean;
}

let nextKey = 0;

function emptyLine(items: ItemOption[]): DraftLine {
  nextKey += 1;
  return {
    key: nextKey,
    itemId: items[0]?.id ?? "",
    condition: "GOOD",
    direction: "DOWN",
    amount: "",
  };
}

function fromDetail(detail: AdjustmentDetail): DraftLine[] {
  return detail.lines.map((line) => {
    nextKey += 1;
    const delta = line.valueDelta ?? 0;
    return {
      key: nextKey,
      itemId: line.itemId,
      condition: line.condition,
      direction: delta < 0 ? "DOWN" : "UP",
      amount: String(Math.abs(delta)),
    };
  });
}

/** The signed change of a line, or null while the amount is not a number. */
function deltaOf(line: DraftLine): number | null {
  try {
    const amount = parseMoney(line.amount);
    return line.direction === "DOWN" ? -amount : amount;
  } catch {
    return null;
  }
}

const selectClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base";

/** Stock · average · value → new average of one line, as the user types. */
function LinePreview({
  line,
  items,
}: {
  line: DraftLine;
  items: ItemOption[];
}) {
  const [preview, setPreview] = useState<ValuePreviewView | null>(null);
  const delta = deltaOf(line);
  useEffect(() => {
    if (delta === null || delta === 0 || !line.itemId) return;
    let live = true;
    const query = new URLSearchParams({
      itemId: line.itemId,
      condition: line.condition,
      valueDelta: String(delta),
    });
    const timer = setTimeout(async () => {
      const result = await callApi<ValuePreviewView>(
        `/api/inventory/adjustments/revalue-preview?${query}`,
      );
      if (live) setPreview(result.ok ? result.data : null);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [line.itemId, line.condition, delta]);
  if (delta === null || delta === 0 || preview === null) return null;
  const unit = items.find((item) => item.id === line.itemId)?.unit ?? "PIECE";
  return (
    <p
      aria-live="polite"
      className={
        preview.error
          ? "text-sm text-destructive sm:col-span-2"
          : "text-sm text-muted-foreground tabular-nums sm:col-span-2"
      }
    >
      {formatValuePreview(preview, unit)}
    </p>
  );
}

/** Draft or edit a value adjustment typed by hand (spec stock-value-adjustments). */
export function ValueAdjustmentSheet({
  items,
  adjustment,
  trigger,
  defaultOpen = false,
}: ValueAdjustmentSheetProps) {
  const router = useRouter();
  const action = useCatalogAction();
  const [open, setOpen] = useState(defaultOpen);
  const [reason, setReason] = useState(adjustment?.reason ?? "");
  const [related, setRelated] = useState(adjustment?.relatedDocumentCode ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    adjustment ? fromDetail(adjustment) : [emptyLine(items)],
  );

  const update = (key: number, changes: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, ...changes } : line,
      ),
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    let body: Record<string, unknown>;
    try {
      body = {
        kind: "REVALUE",
        reason,
        relatedDocumentCode: related,
        updatedAt: adjustment?.updatedAt ?? null,
        lines: lines.map((line) => {
          const amount = parseMoney(line.amount);
          return {
            itemId: line.itemId,
            condition: line.condition,
            valueDelta: line.direction === "DOWN" ? -amount : amount,
          };
        }),
      };
    } catch (cause: unknown) {
      if (cause instanceof DomainValueError) {
        action.setError(cause.message);
        return;
      }
      throw cause;
    }
    const saved = await action.run<{ id: string }>(
      adjustment
        ? `/api/inventory/adjustments/${adjustment.id}`
        : "/api/inventory/adjustments",
      { method: adjustment ? "PATCH" : "POST", body },
    );
    if (!saved) return;
    setOpen(false);
    if (!adjustment && saved.data)
      router.push(`/inventory/adjustments/${saved.data.id}`);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {adjustment
              ? `Sửa ${adjustment.code}`
              : "Lập phiếu điều chỉnh giá trị"}
          </SheetTitle>
          <SheetDescription>
            Chỉ đổi giá trị, không đổi số lượng. Giá BQ mới tính theo tồn lúc
            Giám đốc duyệt.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 px-4 pb-6"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="value-related">Chứng từ bị sửa</Label>
            <Input
              id="value-related"
              value={related}
              onChange={(event) => setRelated(event.target.value)}
              placeholder="VD: PN-2026-094"
              className="w-64"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="value-reason">Lý do</Label>
            <textarea
              id="value-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={3}
              className="rounded-md border border-input bg-card px-3 py-2 text-base"
              placeholder="VD: Phiếu nhập ghi nhầm đơn giá khung"
            />
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-label">Các dòng</legend>
            {lines.map((line, index) => {
              const id = (name: string) => `value-${line.key}-${name}`;
              return (
                <div
                  key={line.key}
                  role="group"
                  aria-label={`Dòng ${index + 1}`}
                  className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-2"
                >
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={id("item")}>Vật tư</Label>
                    <select
                      id={id("item")}
                      value={line.itemId}
                      onChange={(event) =>
                        update(line.key, { itemId: event.target.value })
                      }
                      className={selectClass}
                    >
                      {items.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.code} · {option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={id("condition")}>Tình trạng</Label>
                    <select
                      id={id("condition")}
                      value={line.condition}
                      onChange={(event) =>
                        update(line.key, {
                          condition: event.target.value as Condition,
                        })
                      }
                      className={selectClass}
                    >
                      {CONDITIONS.map((condition) => (
                        <option key={condition} value={condition}>
                          {CONDITION_LABELS[condition]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={id("direction")}>Tăng hay giảm</Label>
                    <select
                      id={id("direction")}
                      value={line.direction}
                      onChange={(event) =>
                        update(line.key, {
                          direction: event.target.value as "UP" | "DOWN",
                        })
                      }
                      className={selectClass}
                    >
                      <option value="DOWN">Giảm giá trị</option>
                      <option value="UP">Tăng giá trị</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={id("amount")}>Chênh lệch (₫)</Label>
                    <Input
                      id={id("amount")}
                      inputMode="numeric"
                      value={line.amount}
                      onChange={(event) =>
                        update(line.key, { amount: event.target.value })
                      }
                    />
                  </div>
                  <LinePreview line={line} items={items} />
                  <div className="flex items-end sm:col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((other) => other.key !== line.key),
                        )
                      }
                    >
                      <Trash2 aria-hidden />
                      Bỏ dòng {index + 1}
                    </Button>
                  </div>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() =>
                setLines((current) => [...current, emptyLine(items)])
              }
            >
              <Plus aria-hidden />
              Thêm dòng
            </Button>
          </fieldset>
          <FormError message={action.error} />
          <Button
            type="submit"
            size="lg"
            className="h-12"
            disabled={action.pending}
          >
            {action.pending
              ? "Đang lưu…"
              : adjustment
                ? "Lưu thay đổi"
                : "Lưu nháp"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
