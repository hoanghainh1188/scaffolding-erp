"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FormError } from "@/components/catalog/form-error";
import { DateInput } from "@/components/domain/date-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { byWeight } from "@/domain/contract-lines";
import { CONDITION_LABELS } from "@/domain/condition";
import type { ContractType } from "@/domain/contract";
import {
  formatQuantityForInput,
  QUANTITY_UNIT_LABELS,
  toQuantity,
} from "@/domain/quantity";
import { callApi } from "@/lib/api-client";
import type {
  ContractDeliveries,
  PlanBatchOption,
} from "@/lib/deliveries/queries";

import {
  bodyOf,
  fromPlan,
  itemKey,
  itemUnit,
  preview,
  rowKey,
  type FormItem,
  type FormState,
  type KitRow,
  type LineRow,
} from "./batch-model";
import { NumericInput } from "@/components/domain/numeric-input";
import { amountText } from "./format";

const select =
  "h-11 min-w-48 rounded-md border border-input bg-card px-3 text-base";

export interface BatchInitial {
  noteId: string;
  updatedAt: string;
  kits: { kitId: string; quantity: number }[];
  lines: { lineKey: string; quantity: string }[];
  sourceLocationId: string;
  plannedDate: string;
  companyTruck: boolean;
  freightAmount: number | null;
  vehiclePlate: string;
  note: string;
}

interface BatchFormProps {
  contractId: string;
  type: ContractType;
  items: ContractDeliveries["items"];
  kits: ContractDeliveries["kits"];
  yards: ContractDeliveries["yards"];
  plan: PlanBatchOption[];
  /** "Chưa lên phiếu" by line key (an edited note's own lines added back). */
  unplanned: Record<string, number>;
  defaults: { companyTruck: boolean; freightPerTrip: number | null };
  initial?: BatchInitial;
  onDone: () => void;
}

const itemLabel = (item: FormItem) =>
  item.condition === null
    ? `${item.code} · ${item.name}`
    : `${item.code} · ${item.name} · ${CONDITION_LABELS[item.condition]}${
        byWeight(item.pricingUnit ?? "") ? " · theo kg" : ""
      }`;

/** "Tạo đợt xuất" / "Sửa đợt xuất" on D6 (deliveries spec, design D3, D4). */
export function BatchForm({
  contractId,
  type,
  items,
  kits,
  yards,
  plan,
  unplanned,
  defaults,
  initial,
  onDone,
}: BatchFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => ({
    type,
    kits:
      initial?.kits.map((kit) => ({
        key: rowKey(),
        kitId: kit.kitId,
        quantity: String(kit.quantity),
      })) ?? [],
    lines:
      initial?.lines.map((line) => ({ key: rowKey(), ...line })) ??
      // A new batch starts from what is not on a note yet.
      items
        .filter((item) => (unplanned[itemKey(item)] ?? 0) > 0)
        .map((item) => ({
          key: rowKey(),
          lineKey: itemKey(item),
          quantity: formatQuantityForInput(
            toQuantity(unplanned[itemKey(item)] ?? 0, itemUnit(item)),
          ),
        })),
    sourceLocationId:
      initial?.sourceLocationId ??
      (yards.length === 1 ? (yards[0]?.id ?? "") : ""),
    plannedDate: initial?.plannedDate ?? "",
    companyTruck: initial?.companyTruck ?? defaults.companyTruck,
    freight:
      initial?.freightAmount != null
        ? String(initial.freightAmount)
        : defaults.freightPerTrip !== null &&
            (initial?.companyTruck ?? defaults.companyTruck)
          ? String(defaults.freightPerTrip)
          : "",
    vehiclePlate: initial?.vehiclePlate ?? "",
    note: initial?.note ?? "",
    overConfirmed: false,
  }));
  const [pickKit, setPickKit] = useState("");
  const [pickItem, setPickItem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = useMemo(
    () => preview(items, kits, state.kits, state.lines, unplanned),
    [items, kits, state.kits, state.lines, unplanned],
  );
  const over = shown.filter((line) => line.overMilli > 0);
  const byKey = new Map(items.map((item) => [itemKey(item), item]));
  const update = (patch: Partial<FormState>) =>
    setState((old) => ({ ...old, ...patch }));

  function addKit() {
    if (!pickKit) return;
    update({
      kits: [...state.kits, { key: rowKey(), kitId: pickKit, quantity: "" }],
    });
    setPickKit("");
  }

  function addLine() {
    if (!pickItem) return;
    update({
      lines: [
        ...state.lines,
        { key: rowKey(), lineKey: pickItem, quantity: "" },
      ],
    });
    setPickItem("");
  }

  function applyPlan(seq: string) {
    const batch = plan.find((entry) => String(entry.seq) === seq);
    if (!batch) return;
    const rows = fromPlan(batch);
    update({ kits: rows.kits, lines: rows.lines });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const body = bodyOf(state, items);
    const result = initial
      ? await callApi<{ code: string }>(`/api/deliveries/${initial.noteId}`, {
          method: "PUT",
          body: { ...body, updatedAt: initial.updatedAt },
        })
      : await callApi<{ code: string }>("/api/deliveries", {
          method: "POST",
          body: { ...body, contractId },
        });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
    if (initial) router.refresh();
    else router.push(`/sales/deliveries/${result.data.code}`);
  }

  const kitById = new Map(kits.map((kit) => [kit.id, kit]));
  const updateKit = (row: KitRow, quantity: string) =>
    update({
      kits: state.kits.map((entry) =>
        entry.key === row.key ? { ...entry, quantity } : entry,
      ),
    });
  const updateLine = (row: LineRow, quantity: string) =>
    update({
      lines: state.lines.map((entry) =>
        entry.key === row.key ? { ...entry, quantity } : entry,
      ),
    });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {plan.length > 0 && !initial ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from-plan">Theo kế hoạch giao của hợp đồng</Label>
          <select
            id="from-plan"
            className={select}
            defaultValue=""
            onChange={(event) => applyPlan(event.target.value)}
          >
            <option value="">Không dùng kế hoạch</option>
            {plan.map((batch) => (
              <option key={batch.seq} value={batch.seq}>
                Theo kế hoạch đợt {batch.seq}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        {type === "RENTAL" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-kit">Thêm bộ</Label>
            <div className="flex gap-2">
              <select
                id="add-kit"
                value={pickKit}
                onChange={(event) => setPickKit(event.target.value)}
                className={select}
              >
                <option value="">Chọn bộ</option>
                {kits.map((kit) => (
                  <option key={kit.id} value={kit.id}>
                    {kit.code} · {kit.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={addKit}
                disabled={!pickKit}
              >
                <Plus aria-hidden /> Thêm bộ
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="add-line">Thêm mã hàng</Label>
          <div className="flex gap-2">
            <select
              id="add-line"
              value={pickItem}
              onChange={(event) => setPickItem(event.target.value)}
              className={select}
            >
              <option value="">Chọn mã trên hợp đồng</option>
              {items.map((item) => (
                <option key={itemKey(item)} value={itemKey(item)}>
                  {itemLabel(item)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={addLine}
              disabled={!pickItem}
            >
              <Plus aria-hidden /> Thêm mã
            </Button>
          </div>
        </div>
      </div>

      {state.kits.length + state.lines.length > 0 ? (
        <ul aria-label="Hàng của đợt" className="flex flex-col gap-2">
          {state.kits.map((row) => {
            const kit = kitById.get(row.kitId);
            return (
              <li
                key={row.key}
                className="flex flex-wrap items-center gap-3 rounded-md border bg-muted px-3 py-2"
              >
                <span className="font-semibold">{kit?.name ?? row.kitId}</span>
                <Label htmlFor={`kit-${row.key}`} className="sr-only">
                  Số bộ {kit?.name}
                </Label>
                <span className="flex items-center gap-1">
                  ×
                  <NumericInput
                    id={`kit-${row.key}`}
                    kind="integer"
                    value={row.quantity}
                    onChange={(event) => updateKit(row, event.target.value)}
                    className="h-9 w-24 text-right tabular-nums"
                  />
                  bộ
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-9"
                  aria-label={`Bỏ ${kit?.name ?? "bộ"}`}
                  onClick={() =>
                    update({
                      kits: state.kits.filter((entry) => entry.key !== row.key),
                    })
                  }
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
          {state.lines.map((row) => {
            const item = byKey.get(row.lineKey);
            return (
              <li
                key={row.key}
                className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
              >
                <span>{item ? itemLabel(item) : row.lineKey}</span>
                <Label htmlFor={`line-${row.key}`} className="sr-only">
                  Số lượng {item?.code}
                </Label>
                <span className="flex items-center gap-1">
                  <NumericInput
                    id={`line-${row.key}`}
                    kind="decimal"
                    value={row.quantity}
                    onChange={(event) => updateLine(row, event.target.value)}
                    className="h-9 w-28 text-right tabular-nums"
                  />
                  {item ? QUANTITY_UNIT_LABELS[itemUnit(item)] : ""}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-9"
                  aria-label={`Bỏ ${item?.code ?? "dòng"}`}
                  onClick={() =>
                    update({
                      lines: state.lines.filter(
                        (entry) => entry.key !== row.key,
                      ),
                    })
                  }
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {shown.length > 0 ? (
        <section
          aria-labelledby="preview-title"
          className="flex flex-col gap-1 text-sm"
        >
          <h3 id="preview-title" className="text-label">
            Thủ kho sẽ nhặt
          </h3>
          <ul className="flex flex-col gap-0.5">
            {shown.map((line) => (
              <li
                key={line.key}
                className={line.overMilli > 0 ? "text-warning" : undefined}
              >
                {itemLabel(line.item)}:{" "}
                {amountText(line.milli, itemUnit(line.item))}
                {line.overMilli > 0
                  ? ` · vượt số còn phải giao ${amountText(line.overMilli, itemUnit(line.item))}`
                  : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {over.length > 0 && type === "RENTAL" ? (
        <div className="flex items-start gap-2 rounded-md border border-warning px-3 py-2 text-sm">
          <Checkbox
            id="over-confirmed"
            checked={state.overConfirmed}
            onCheckedChange={(checked) =>
              update({ overConfirmed: checked === true })
            }
          />
          <Label htmlFor="over-confirmed" required className="font-normal">
            Tôi xác nhận xuất vượt số trên hợp đồng. Giám đốc sẽ thấy việc này
            trong nhật ký.
          </Label>
        </div>
      ) : null}
      {over.length > 0 && type === "SALE" ? (
        <p className="text-sm text-warning">
          Hợp đồng bán không xuất quá số còn phải giao. Bạn giảm số hoặc lập phụ
          lục.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {yards.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source" required>
              Bãi xuất hàng
            </Label>
            <select
              id="source"
              required
              className={select}
              value={state.sourceLocationId}
              onChange={(event) =>
                update({ sourceLocationId: event.target.value })
              }
            >
              <option value="">Chọn bãi</option>
              {yards.map((yard) => (
                <option key={yard.id} value={yard.id}>
                  {yard.code} · {yard.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="planned-date">Ngày dự kiến xe đi</Label>
          <DateInput
            id="planned-date"
            value={state.plannedDate}
            onValueChange={(value) => update({ plannedDate: value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plate">Biển số xe (nếu đã biết)</Label>
          <Input
            id="plate"
            value={state.vehiclePlate}
            onChange={(event) => update({ vehiclePlate: event.target.value })}
            placeholder="51X-000.01"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="company-truck"
            checked={state.companyTruck}
            onCheckedChange={(checked) =>
              update({ companyTruck: checked === true })
            }
          />
          <Label htmlFor="company-truck" className="font-normal">
            Công ty gọi xe (tính cước chiều đi)
          </Label>
        </div>
        {state.companyTruck ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="freight" required>
              Cước chiều đi (₫)
            </Label>
            <NumericInput
              id="freight"
              kind="money"
              required
              value={state.freight}
              onChange={(event) => update({ freight: event.target.value })}
              className="text-right tabular-nums"
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="note">Ghi chú cho thủ kho</Label>
          <Input
            id="note"
            value={state.note}
            onChange={(event) => update({ note: event.target.value })}
          />
        </div>
      </div>

      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={busy}
        >
          Đóng
        </Button>
        <Button type="submit" disabled={busy}>
          {initial ? "Lưu đợt xuất" : "Lưu và gửi thủ kho"}
        </Button>
      </div>
    </form>
  );
}
