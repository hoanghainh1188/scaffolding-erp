"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { DateInput } from "@/components/domain/date-input";
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
import {
  QUANTITY_UNIT_LABELS,
  formatQuantityForInput,
  parseQuantity,
  quantityToDb,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import {
  ADJUSTMENT_LINE_TYPE_LABELS,
  type AdjustmentKind,
  type AdjustmentLineType,
} from "@/domain/stock-adjustment";
import { NumericInput } from "@/components/domain/numeric-input";
import type { AdjustmentDetail } from "@/lib/inventory/adjustments";

export interface ItemOption {
  id: string;
  code: string;
  name: string;
  unit: QuantityUnit;
}

export interface PlaceOption {
  id: string;
  code: string;
  name: string;
}

interface DraftLine {
  key: number;
  lineType: AdjustmentLineType;
  itemId: string;
  condition: Condition;
  toCondition: Condition;
  locationId: string;
  toLocationId: string;
  direction: "IN" | "OUT";
  quantity: string;
  unitCost: string;
}

interface AdjustmentFormSheetProps {
  kind: AdjustmentKind;
  items: ItemOption[];
  places: PlaceOption[];
  /** Editing this draft; absent to create one. */
  adjustment?: AdjustmentDetail;
  trigger?: ReactNode;
  defaultOpen?: boolean;
  today: string;
}

const TITLES: Readonly<Record<AdjustmentKind, string>> = {
  ADJUSTMENT: "Phiếu điều chỉnh",
  OPENING: "Phiếu tồn đầu kỳ",
  REVALUE: "Phiếu điều chỉnh giá trị",
};

let nextKey = 0;

function emptyLine(
  kind: AdjustmentKind,
  items: ItemOption[],
  places: PlaceOption[],
): DraftLine {
  nextKey += 1;
  return {
    key: nextKey,
    lineType: kind === "OPENING" ? "OPENING" : "QUANTITY",
    itemId: items[0]?.id ?? "",
    condition: "GOOD",
    toCondition: "NEEDS_REPAIR",
    locationId: places[0]?.id ?? "",
    toLocationId: places[1]?.id ?? places[0]?.id ?? "",
    direction: "OUT",
    quantity: "",
    unitCost: "",
  };
}

function fromDetail(
  detail: AdjustmentDetail,
  items: ItemOption[],
): DraftLine[] {
  return detail.lines.map((line) => {
    nextKey += 1;
    const unit =
      items.find((option) => option.id === line.itemId)?.unit ?? line.unit;
    return {
      key: nextKey,
      lineType: line.lineType,
      itemId: line.itemId,
      condition: line.condition,
      toCondition: line.toCondition ?? "NEEDS_REPAIR",
      locationId: line.locationId ?? "",
      toLocationId: line.toLocationId ?? line.locationId ?? "",
      direction: line.quantity < 0 ? "OUT" : "IN",
      quantity: formatQuantityForInput(
        toQuantity(Math.abs(line.quantity), unit),
      ),
      unitCost: line.unitCost === null ? "" : String(line.unitCost),
    };
  });
}

const selectClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base";

/** Draft or edit an adjustment / opening document (spec stock-adjustments). */
export function AdjustmentFormSheet({
  kind,
  items,
  places,
  adjustment,
  trigger,
  defaultOpen = false,
  today,
}: AdjustmentFormSheetProps) {
  const router = useRouter();
  const action = useCatalogAction();
  const [open, setOpen] = useState(defaultOpen);
  const [reason, setReason] = useState(adjustment?.reason ?? "");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [related, setRelated] = useState(adjustment?.relatedDocumentCode ?? "");
  const [openingDate, setOpeningDate] = useState(
    adjustment?.openingDate ?? today,
  );
  const [lines, setLines] = useState<DraftLine[]>(() =>
    adjustment
      ? fromDetail(adjustment, items)
      : [emptyLine(kind, items, places)],
  );

  const update = (key: number, changes: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, ...changes } : line,
      ),
    );

  function lineBody(line: DraftLine) {
    const unit =
      items.find((option) => option.id === line.itemId)?.unit ?? "PIECE";
    const amount = parseQuantity(line.quantity, unit);
    const signed =
      line.lineType === "QUANTITY" && line.direction === "OUT"
        ? -amount.milli
        : amount.milli;
    return {
      lineType: line.lineType,
      itemId: line.itemId,
      condition: line.condition,
      toCondition: line.lineType === "CONDITION" ? line.toCondition : null,
      locationId: line.locationId,
      toLocationId: line.lineType === "LOCATION" ? line.toLocationId : null,
      quantity: quantityToDb(toQuantity(signed, unit)),
      unitCost: line.unitCost.trim() === "" ? null : parseMoney(line.unitCost),
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    let body: Record<string, unknown>;
    try {
      body = {
        kind,
        reason,
        relatedDocumentCode: related,
        openingDate: kind === "OPENING" ? openingDate : null,
        lines: lines.map(lineBody),
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
              : `Lập ${TITLES[kind].toLowerCase()}`}
          </SheetTitle>
          <SheetDescription>
            Chỉ ghi sổ kho khi Giám đốc duyệt. Lý do là bắt buộc.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 px-4 pb-6"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adjustment-reason" required>
              Lý do
            </Label>
            <textarea
              id="adjustment-reason"
              value={reason}
              aria-invalid={Boolean(reasonError)}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError && event.target.value.trim()) {
                  setReasonError(null);
                }
              }}
              onBlur={() => {
                if (!reason.trim()) {
                  setReasonError("Vui lòng nhập lý do.");
                }
              }}
              maxLength={500}
              rows={3}
              className="rounded-md border border-input bg-card px-3 py-2 text-base aria-invalid:border-destructive"
              placeholder={
                kind === "OPENING"
                  ? "VD: Số tồn khi bắt đầu dùng phần mềm"
                  : "VD: Sửa PTH-2026-064: 10 cái thực tế là Chờ sửa"
              }
            />
            {reasonError && action.error !== reasonError ? (
              <p className="text-caption text-destructive">{reasonError}</p>
            ) : null}
          </div>
          {kind === "OPENING" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjustment-opening-date" required>
                Ngày tồn đầu
              </Label>
              <DateInput
                id="adjustment-opening-date"
                value={openingDate}
                max={today}
                required
                onValueChange={setOpeningDate}
                className="w-48"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjustment-related">
                Chứng từ bị sửa (nếu có)
              </Label>
              <Input
                id="adjustment-related"
                value={related}
                onChange={(event) => setRelated(event.target.value)}
                placeholder="VD: PTH-2026-064"
                className="w-64"
              />
            </div>
          )}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-label">Các dòng</legend>
            {lines.map((line, index) => {
              const unit =
                items.find((option) => option.id === line.itemId)?.unit ??
                "PIECE";
              const id = (name: string) => `line-${line.key}-${name}`;
              return (
                <div
                  key={line.key}
                  role="group"
                  aria-label={`Dòng ${index + 1}`}
                  className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-2"
                >
                  {kind === "ADJUSTMENT" ? (
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={id("type")}>Kiểu</Label>
                      <select
                        id={id("type")}
                        value={line.lineType}
                        onChange={(event) =>
                          update(line.key, {
                            lineType: event.target.value as AdjustmentLineType,
                          })
                        }
                        className={selectClass}
                      >
                        {(["QUANTITY", "CONDITION", "LOCATION"] as const).map(
                          (type) => (
                            <option key={type} value={type}>
                              {ADJUSTMENT_LINE_TYPE_LABELS[type]}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={id("item")} required>
                      Vật tư
                    </Label>
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
                    <Label htmlFor={id("condition")}>
                      {line.lineType === "CONDITION"
                        ? "Từ tình trạng"
                        : "Tình trạng"}
                    </Label>
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
                  {line.lineType === "CONDITION" ? (
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={id("to-condition")} required>
                        Sang tình trạng
                      </Label>
                      <select
                        id={id("to-condition")}
                        value={line.toCondition}
                        onChange={(event) =>
                          update(line.key, {
                            toCondition: event.target.value as Condition,
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
                  ) : null}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={id("location")} required>
                      {line.lineType === "LOCATION" ? "Từ vị trí" : "Vị trí"}
                    </Label>
                    <select
                      id={id("location")}
                      value={line.locationId}
                      onChange={(event) =>
                        update(line.key, { locationId: event.target.value })
                      }
                      className={selectClass}
                    >
                      {places.map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.code} · {place.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {line.lineType === "LOCATION" ? (
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={id("to-location")} required>
                        Sang vị trí
                      </Label>
                      <select
                        id={id("to-location")}
                        value={line.toLocationId}
                        onChange={(event) =>
                          update(line.key, { toLocationId: event.target.value })
                        }
                        className={selectClass}
                      >
                        {places.map((place) => (
                          <option key={place.id} value={place.id}>
                            {place.code} · {place.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {line.lineType === "QUANTITY" ? (
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={id("direction")}>Tăng hay giảm</Label>
                      <select
                        id={id("direction")}
                        value={line.direction}
                        onChange={(event) =>
                          update(line.key, {
                            direction: event.target.value as "IN" | "OUT",
                          })
                        }
                        className={selectClass}
                      >
                        <option value="OUT">Giảm (thiếu, mất)</option>
                        <option value="IN">Tăng (thừa)</option>
                      </select>
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={id("quantity")} required>
                      Số lượng ({QUANTITY_UNIT_LABELS[unit]})
                    </Label>
                    <NumericInput
                      id={id("quantity")}
                      kind="decimal"
                      value={line.quantity}
                      onChange={(event) =>
                        update(line.key, { quantity: event.target.value })
                      }
                    />
                  </div>
                  {line.lineType === "OPENING" ||
                  (line.lineType === "QUANTITY" && line.direction === "IN") ? (
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor={id("cost")}
                        required={line.lineType === "OPENING"}
                      >
                        {line.lineType === "OPENING"
                          ? `Đơn giá vốn (₫/${QUANTITY_UNIT_LABELS[unit]})`
                          : "Đơn giá (chỉ khi chưa có giá vốn)"}
                      </Label>
                      <NumericInput
                        id={id("cost")}
                        kind="money"
                        value={line.unitCost}
                        onChange={(event) =>
                          update(line.key, { unitCost: event.target.value })
                        }
                      />
                    </div>
                  ) : null}
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
                setLines((current) => [
                  ...current,
                  emptyLine(kind, items, places),
                ])
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
