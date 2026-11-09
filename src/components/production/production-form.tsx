"use client";

// A draft production order (spec "Lập lệnh sản xuất"): workshop, yard, team,
// the finished items and the materials they will take by the BOM of today.
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normMilli } from "@/domain/production-order";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { callApi } from "@/lib/api-client";
import type { ItemChoice } from "@/lib/production/queries";

import { ProductionTabs } from "./production-tabs";

export interface ProductionDraft {
  code: string;
  updatedAt: string;
  workshopId: string;
  toLocationId: string;
  team: string | null;
  note: string | null;
  lines: { itemId: string; plannedMilli: number }[];
}

interface Place {
  id: string;
  code: string;
  name: string;
  type: string;
}

type Norm = {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  perUnitMilli: number;
};

interface ProductionFormProps {
  places: Place[];
  items: ItemChoice[];
  norms: Record<string, Norm[]>;
  draft?: ProductionDraft;
}

interface Line {
  key: number;
  itemId: string;
  planned: string;
}

interface Saved {
  code: string;
  updatedAt: string;
}

const SELECT = "h-11 rounded-md border bg-card px-3 text-base";

/** "100" → 100000; null when it is not a positive whole number. */
function plannedMilli(text: string): number | null {
  const value = Number(text.trim());
  return Number.isInteger(value) && value > 0 ? value * 1000 : null;
}

function Expected({ line, norms }: { line: Line; norms: Norm[] }) {
  const milli = plannedMilli(line.planned);
  if (milli === null || norms.length === 0) return null;
  return (
    <ul
      aria-label="Nguyên liệu dự kiến"
      className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground"
    >
      {norms.map((norm) => (
        <li key={norm.itemId} className="tabular-nums">
          {norm.code}{" "}
          {formatQuantity(
            toQuantity(
              normMilli(norm.perUnitMilli, milli, norm.unit),
              norm.unit,
            ),
          )}{" "}
          {QUANTITY_UNIT_LABELS[norm.unit]}
        </li>
      ))}
    </ul>
  );
}

export function ProductionForm({
  places,
  items,
  norms,
  draft,
}: ProductionFormProps) {
  const router = useRouter();
  const workshops = places.filter((place) => place.type === "WORKSHOP");
  const yards = places.filter((place) => place.type === "YARD");
  const [workshopId, setWorkshopId] = useState(
    draft?.workshopId ?? workshops[0]?.id ?? "",
  );
  const [toLocationId, setTo] = useState(
    draft?.toLocationId ?? yards[0]?.id ?? "",
  );
  const [team, setTeam] = useState(draft?.team ?? "");
  const [note, setNote] = useState(draft?.note ?? "");
  const [lines, setLines] = useState<Line[]>(
    draft?.lines.map((line, key) => ({
      key,
      itemId: line.itemId,
      planned: String(line.plannedMilli / 1000),
    })) ?? [{ key: 0, itemId: items[0]?.itemId ?? "", planned: "" }],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useMemo(
    () => () => Math.max(-1, ...lines.map((line) => line.key)) + 1,
    [lines],
  );

  const body = () => ({
    workshopId,
    toLocationId,
    team: team.trim() || null,
    note: note.trim() || null,
    lines: lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.planned.trim(),
    })),
    ...(draft ? { updatedAt: draft.updatedAt } : {}),
  });

  async function save(): Promise<Saved | null> {
    setError(null);
    const result = draft
      ? await callApi<Saved>(`/api/production/orders/${draft.code}`, {
          method: "PATCH",
          body: body(),
        })
      : await callApi<Saved>("/api/production/orders", {
          method: "POST",
          body: body(),
        });
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    return result.data;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const saved = await save();
    setPending(false);
    if (!saved) return;
    router.push(`/production/${saved.code}?saved=draft`);
    router.refresh();
  }

  async function assign() {
    setPending(true);
    const saved = await save();
    if (!saved) {
      setPending(false);
      return;
    }
    const result = await callApi(
      `/api/production/orders/${saved.code}/assign`,
      { method: "POST", body: { updatedAt: saved.updatedAt } },
    );
    setPending(false);
    if (!result.ok) setError(result.error);
    router.push(`/production/${saved.code}`);
    router.refresh();
  }

  async function remove() {
    if (!draft) return;
    setPending(true);
    const result = await callApi(`/api/production/orders/${draft.code}`, {
      method: "DELETE",
      body: { updatedAt: draft.updatedAt },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/production");
    router.refresh();
  }

  const update = (key: number, next: Partial<Line>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...next } : l)));

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">
          {draft ? `Lệnh sản xuất ${draft.code}` : "Lệnh sản xuất mới"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Nguyên liệu dự kiến tính theo định mức hôm nay. Lúc giao xưởng lệnh
          chụp định mức và đơn giá công.
        </p>
      </div>
      <ProductionTabs active="orders" />
      <section className="grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="production-workshop">Xưởng</Label>
          <select
            id="production-workshop"
            className={SELECT}
            value={workshopId}
            onChange={(event) => setWorkshopId(event.target.value)}
          >
            {workshops.map((place) => (
              <option key={place.id} value={place.id}>
                {place.code} · {place.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="production-yard">Bãi nhận thành phẩm</Label>
          <select
            id="production-yard"
            className={SELECT}
            value={toLocationId}
            onChange={(event) => setTo(event.target.value)}
          >
            {yards.map((place) => (
              <option key={place.id} value={place.id}>
                {place.code} · {place.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="production-team">Tổ làm</Label>
          <Input
            id="production-team"
            value={team}
            maxLength={100}
            onChange={(event) => setTeam(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="production-order-note">Ghi chú</Label>
          <Input
            id="production-order-note"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </section>
      <section
        aria-label="Thành phẩm"
        className="flex flex-col gap-4 rounded-lg border bg-card p-5"
      >
        <h2 className="font-display text-h2">Thành phẩm</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có thành phẩm nào có định mức. Lập định mức trước.
          </p>
        ) : null}
        {lines.map((line, index) => (
          <div key={line.key} className="flex flex-col gap-2 border-b pb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-64 flex-1 flex-col gap-1.5">
                <Label htmlFor={`production-item-${line.key}`}>Mã hàng</Label>
                <select
                  id={`production-item-${line.key}`}
                  className={SELECT}
                  value={line.itemId}
                  onChange={(event) =>
                    update(line.key, { itemId: event.target.value })
                  }
                >
                  {items.map((item) => (
                    <option key={item.itemId} value={item.itemId}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex w-36 flex-col gap-1.5">
                <Label htmlFor={`production-planned-${line.key}`}>
                  Số kế hoạch
                </Label>
                <Input
                  id={`production-planned-${line.key}`}
                  inputMode="numeric"
                  value={line.planned}
                  onChange={(event) =>
                    update(line.key, { planned: event.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Bỏ dòng ${index + 1}`}
                disabled={lines.length === 1}
                onClick={() =>
                  setLines(lines.filter((l) => l.key !== line.key))
                }
              >
                <X aria-hidden />
              </Button>
            </div>
            <Expected line={line} norms={norms[line.itemId] ?? []} />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={items.length === 0}
          onClick={() =>
            setLines([
              ...lines,
              { key: nextKey(), itemId: items[0]?.itemId ?? "", planned: "" },
            ])
          }
        >
          + Thêm thành phẩm
        </Button>
      </section>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          Lưu nháp
        </Button>
        <Button type="button" disabled={pending} onClick={() => void assign()}>
          Giao xưởng
        </Button>
        {draft ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => void remove()}
          >
            Xóa nháp
          </Button>
        ) : null}
      </div>
    </form>
  );
}
