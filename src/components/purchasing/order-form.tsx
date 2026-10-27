"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { FormError } from "@/components/catalog/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DomainValueError } from "@/domain/errors";
import type { AllocationMethod } from "@/domain/landed-cost";
import {
  PURCHASE_KIND_LABELS,
  PURCHASE_KINDS,
  PURCHASE_MESSAGES,
  type EditableFields,
  type PurchaseKind,
} from "@/domain/purchase-order";
import {
  formatQuantityForInput,
  parseQuantity,
  quantityToDb,
  toQuantity,
} from "@/domain/quantity";
import { callApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { FieldMessage } from "./field-message";
import { OrderCosts } from "./order-costs";
import { OrderLines } from "./order-lines";
import { OrderTotal } from "./order-total";
import {
  previewOrder,
  readMoney,
  type DraftCost,
  type DraftLine,
  type ItemChoice,
} from "./preview";

export interface SupplierChoice {
  id: string;
  code: string;
  name: string;
}

/** An order being edited, as getOrderByCode returns it. */
export interface EditedOrder {
  code: string;
  status: "DRAFT" | "IN_PROGRESS" | "DONE";
  editable: EditableFields;
  updatedAt: string;
  supplierId: string;
  kind: PurchaseKind;
  expectedDate: string | null;
  expectedTime: string | null;
  vehicle: string | null;
  note: string | null;
  allocationMethod: AllocationMethod;
  lines: {
    itemId: string;
    unit: "PIECE" | "KG";
    quantity: number;
    unitPrice: number;
  }[];
  costs: { label: string; amount: number }[];
}

interface OrderFormProps {
  suppliers: SupplierChoice[];
  items: ItemChoice[];
  order?: EditedOrder;
}

let nextKey = 1;
const key = () => (nextKey += 1);

const emptyLine = (): DraftLine => ({
  key: key(),
  itemId: "",
  unit: "PIECE",
  quantity: "",
  unitPrice: "",
});

const emptyCost = (label = ""): DraftCost => ({
  key: key(),
  label,
  amount: "",
});

type Save = "draft" | "place" | "update";

/** D3: create (new) or edit (order) a purchase order. */
export function OrderForm({ suppliers, items, order }: OrderFormProps) {
  const router = useRouter();
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const [supplierId, setSupplierId] = useState(order?.supplierId ?? "");
  const [kind, setKind] = useState<PurchaseKind>(order?.kind ?? "USED");
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate ?? "");
  const [expectedTime, setExpectedTime] = useState(order?.expectedTime ?? "");
  const [vehicle, setVehicle] = useState(order?.vehicle ?? "");
  const [note, setNote] = useState(order?.note ?? "");
  const [method, setMethod] = useState<AllocationMethod>(
    order?.allocationMethod ?? "VALUE",
  );
  const [lines, setLines] = useState<DraftLine[]>(() =>
    order?.lines.length
      ? order.lines.map((line) => ({
          key: key(),
          itemId: line.itemId,
          unit: line.unit,
          quantity: formatQuantityForInput(toQuantity(line.quantity, "KG")),
          unitPrice: String(line.unitPrice),
        }))
      : [emptyLine()],
  );
  const [costs, setCosts] = useState<DraftCost[]>(() =>
    order
      ? order.costs.map((cost) => ({
          key: key(),
          label: cost.label,
          amount: String(cost.amount),
        }))
      : [emptyCost("Cước xe tải"), emptyCost("Bốc xếp")],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState<Save | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const locked = order?.editable === "SCHEDULE";
  const preview = previewOrder(lines, costs, method, itemById);

  const changeLine = (lineKey: number, change: Partial<DraftLine>) =>
    setLines((all) =>
      all.map((line) => (line.key === lineKey ? { ...line, ...change } : line)),
    );
  const changeCost = (costKey: number, change: Partial<DraftCost>) =>
    setCosts((all) =>
      all.map((cost) => (cost.key === costKey ? { ...cost, ...change } : cost)),
    );

  /** The request body, or field errors found before sending. */
  function body(): { ok: true; value: unknown } | { ok: false } {
    const found: Record<string, string> = {};
    const sentLines = lines
      .filter((line) => line.itemId || line.quantity || line.unitPrice)
      .map((line, index) => {
        let quantity = "";
        try {
          quantity = quantityToDb(parseQuantity(line.quantity || "0", "KG"));
        } catch (problem) {
          if (!(problem instanceof DomainValueError)) throw problem;
          found[`lines.${index}.quantity`] = problem.message;
        }
        const price = readMoney(line.unitPrice);
        if (price === null) {
          found[`lines.${index}.unitPrice`] = PURCHASE_MESSAGES.price;
        }
        return {
          itemId: line.itemId,
          unit: line.unit,
          quantity,
          unitPrice: price ?? -1,
        };
      });
    const sentCosts = costs
      // A suggested row left without an amount is not a cost.
      .filter((cost) => cost.amount.trim() !== "")
      .map((cost, index) => {
        const amount = readMoney(cost.amount);
        if (amount === null || amount <= 0) {
          found[`costs.${index}.amount`] = PURCHASE_MESSAGES.costAmount;
        }
        return { label: cost.label, amount: amount ?? 0 };
      });
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return { ok: false };
    }
    return {
      ok: true,
      value: {
        supplierId,
        kind,
        expectedDate: expectedDate || null,
        expectedTime: expectedTime || null,
        vehicle: vehicle || null,
        note: note || null,
        allocationMethod: method,
        lines: sentLines,
        costs: sentCosts,
        ...(order ? { updatedAt: order.updatedAt } : {}),
      },
    };
  }

  async function save(mode: Save) {
    setErrors({});
    setError(null);
    const built = body();
    if (!built.ok) return;
    setPending(mode);
    const result = order
      ? await callApi<{ code: string }>(
          `/api/purchasing/orders/${order.code}`,
          {
            method: "PATCH",
            body: built.value,
          },
        )
      : await callApi<{ code: string }>("/api/purchasing/orders", {
          method: "POST",
          body: { ...(built.value as object), place: mode === "place" },
        });
    let placed = !order && mode === "place";
    if (result.ok && order && mode === "place") {
      const place = await callApi(
        `/api/purchasing/orders/${order.code}/place`,
        { method: "POST" },
      );
      if (!place.ok) {
        setPending(null);
        if (place.field) setErrors({ [place.field]: place.error });
        setError(place.error);
        router.refresh();
        return;
      }
      placed = true;
    }
    setPending(null);
    if (!result.ok) {
      if (result.field) setErrors({ [result.field]: result.error });
      if (result.error === PURCHASE_MESSAGES.stale) setStale(true);
      setError(result.error);
      formRef.current
        ?.querySelector<HTMLElement>("[role=alert]")
        ?.scrollIntoView?.({ block: "center" });
      return;
    }
    router.push(
      `/purchasing/orders/${result.data.code}${placed ? "?saved=placed" : ""}`,
    );
    router.refresh();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save(order && order.status !== "DRAFT" ? "update" : "place");
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <section
          aria-labelledby="order-head-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="order-head-title" className="font-display text-h2">
            Thông tin chung
          </h2>
          {locked ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              {PURCHASE_MESSAGES.editLocked}
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-supplier">Nhà cung cấp / cai thầu</Label>
              <select
                id="order-supplier"
                value={supplierId}
                disabled={locked}
                onChange={(event) => setSupplierId(event.target.value)}
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-base"
              >
                <option value="">Chọn nhà cung cấp</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} · {supplier.code}
                  </option>
                ))}
              </select>
              <FieldMessage message={errors.supplierId} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span id="order-kind" className="text-label">
                Loại hàng
              </span>
              <div
                role="group"
                aria-labelledby="order-kind"
                className="grid h-11 grid-cols-2 rounded-md bg-muted p-1"
              >
                {[...PURCHASE_KINDS].reverse().map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={kind === value}
                    disabled={locked}
                    onClick={() => setKind(value)}
                    className={cn(
                      "rounded-sm text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      kind === value
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {PURCHASE_KIND_LABELS[value]}
                  </button>
                ))}
              </div>
              <FieldMessage message={errors.kind} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="order-date">Ngày dự kiến nhập</Label>
                <Input
                  id="order-date"
                  type="date"
                  value={expectedDate}
                  onChange={(event) => setExpectedDate(event.target.value)}
                />
                <FieldMessage message={errors.expectedDate} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="order-time">Giờ</Label>
                <Input
                  id="order-time"
                  type="time"
                  value={expectedTime}
                  onChange={(event) => setExpectedTime(event.target.value)}
                />
                <FieldMessage message={errors.expectedTime} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-vehicle">Phương tiện vận chuyển</Label>
              <Input
                id="order-vehicle"
                value={vehicle}
                maxLength={100}
                placeholder="Xe tải 8 tấn · 29H-123.45"
                onChange={(event) => setVehicle(event.target.value)}
              />
              <FieldMessage message={errors.vehicle} />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label htmlFor="order-note">Ghi chú</Label>
              <textarea
                id="order-note"
                value={note}
                maxLength={1000}
                rows={2}
                onChange={(event) => setNote(event.target.value)}
                className="rounded-md border border-input bg-card px-3 py-2 text-base"
              />
              <FieldMessage message={errors.note} />
            </div>
          </div>
        </section>
        <OrderLines
          lines={lines}
          previews={preview.lines}
          items={items}
          itemById={itemById}
          locked={locked}
          errors={errors}
          onChange={changeLine}
          onAdd={() => setLines((all) => [...all, emptyLine()])}
          onRemove={(lineKey) =>
            setLines((all) => all.filter((line) => line.key !== lineKey))
          }
        />
        <OrderCosts
          costs={costs}
          total={preview.costs}
          method={method}
          allocationError={preview.allocationError}
          locked={locked}
          errors={errors}
          onChange={changeCost}
          onAdd={() => setCosts((all) => [...all, emptyCost()])}
          onRemove={(costKey) =>
            setCosts((all) => all.filter((cost) => cost.key !== costKey))
          }
          onMethod={setMethod}
        />
      </div>
      <aside
        aria-label="Tổng cộng và lưu"
        className="flex flex-col gap-4 lg:sticky lg:top-20"
      >
        <OrderTotal
          title="Tổng cộng"
          total={preview.total}
          rows={[
            { label: "Tiền hàng", value: preview.goods },
            { label: "Chi phí mua hàng", value: preview.costs },
          ]}
        />
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <FormError message={error} />
          {stale ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Tải lại trang
            </Button>
          ) : null}
          {order && order.status !== "DRAFT" ? (
            <Button type="submit" disabled={pending !== null}>
              Lưu thay đổi
            </Button>
          ) : (
            <>
              <Button type="submit" disabled={pending !== null}>
                Lưu đơn
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending !== null}
                onClick={() => void save("draft")}
              >
                Lưu nháp
              </Button>
              <p className="text-caption text-muted-foreground">
                Lưu xong, đơn hiện ở mục &quot;Xe sắp về&quot; trên điện thoại
                của thủ kho.
              </p>
            </>
          )}
        </div>
      </aside>
    </form>
  );
}
