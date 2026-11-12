"use client";

// D12 of a draft work order (repair-work-orders spec "Màn D12 lệnh sửa
// chữa", scenario "Lệnh nháp"): workshop, team, where the stock is taken,
// the lines from "Đang chờ sửa tại …", then save or "Giao xưởng".
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  toQuantity,
} from "@/domain/quantity";
import { callApi } from "@/lib/api-client";
import type { AwaitingItem, RepairPlace } from "@/lib/repairs/queries";

import { AwaitingList } from "./awaiting-list";
import { NumericInput } from "@/components/domain/numeric-input";

export interface WorkOrderDraft {
  code: string;
  updatedAt: string;
  workshopId: string;
  fromLocationId: string;
  repairedBy: string | null;
  note: string | null;
  lines: { itemId: string; takenMilli: number }[];
}

interface WorkOrderFormProps {
  places: RepairPlace[];
  /** Chờ sửa at the chosen source place. */
  awaiting: AwaitingItem[];
  draft?: WorkOrderDraft;
}

interface Line {
  itemId: string;
  taken: string;
}

export function WorkOrderForm({ places, awaiting, draft }: WorkOrderFormProps) {
  const router = useRouter();
  const workshops = places.filter((place) => place.type === "WORKSHOP");
  const yards = places.filter((place) => place.type === "YARD");
  const [workshopId, setWorkshopId] = useState(
    draft?.workshopId ?? workshops[0]?.id ?? "",
  );
  const [fromLocationId, setFrom] = useState(
    draft?.fromLocationId ?? yards[0]?.id ?? "",
  );
  const [repairedBy, setRepairedBy] = useState(draft?.repairedBy ?? "");
  const [note, setNote] = useState(draft?.note ?? "");
  const [lines, setLines] = useState<Line[]>(
    draft?.lines.map((line) => ({
      itemId: line.itemId,
      taken: String(line.takenMilli / 1000),
    })) ?? [],
  );
  const [items, setItems] = useState(awaiting);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(items.map((item) => [item.itemId, item]));
  const sources = [
    ...yards,
    ...workshops.filter((place) => place.id === workshopId),
  ];

  async function changeSource(id: string) {
    setFrom(id);
    setLines([]);
    const result = await callApi<{ items: AwaitingItem[] }>(
      `/api/repairs/awaiting?locationId=${id}`,
    );
    if (result.ok) setItems(result.data.items);
  }

  const body = () => ({
    workshopId,
    fromLocationId,
    repairedBy: repairedBy.trim() || null,
    note: note.trim() || null,
    lines: lines.map((line) => ({
      itemId: line.itemId,
      quantityTaken: line.taken.trim(),
    })),
    ...(draft ? { updatedAt: draft.updatedAt } : {}),
  });

  async function save(): Promise<{ code: string; updatedAt: string } | null> {
    setError(null);
    const result = draft
      ? await callApi<{ code: string; updatedAt: string }>(
          `/api/repairs/${draft.code}`,
          { method: "PUT", body: body() },
        )
      : await callApi<{ code: string; updatedAt: string }>("/api/repairs", {
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
    router.push(`/repairs/${saved.code}?saved=draft`);
    router.refresh();
  }

  async function assign() {
    setPending(true);
    const saved = await save();
    if (!saved) {
      setPending(false);
      return;
    }
    const result = await callApi(`/api/repairs/${saved.code}/assign`, {
      method: "POST",
      body: { updatedAt: saved.updatedAt },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      router.push(`/repairs/${saved.code}`);
      return;
    }
    router.push(`/repairs/${saved.code}`);
    router.refresh();
  }

  async function remove() {
    if (!draft) return;
    setPending(true);
    const result = await callApi(`/api/repairs/${draft.code}`, {
      method: "DELETE",
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/repairs");
    router.refresh();
  }

  const sourceName =
    places.find((place) => place.id === fromLocationId)?.name ?? "";

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">
          {draft ? `Lệnh sửa chữa ${draft.code}` : "Lệnh sửa chữa mới"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Văn phòng lập lệnh và giao xưởng. Xưởng nhận lệnh trên điện thoại,
          hàng Chờ sửa tự chuyển sang xưởng.
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="work-head"
            className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-2"
          >
            <h2 id="work-head" className="font-display text-h2 md:col-span-2">
              Thông tin lệnh
            </h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="work-workshop">Xưởng</Label>
              <select
                id="work-workshop"
                value={workshopId}
                onChange={(event) => setWorkshopId(event.target.value)}
                className="h-11 rounded-md border border-input bg-card px-3 text-base"
              >
                {workshops.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name} · {place.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="work-team">Tổ sửa</Label>
              <Input
                id="work-team"
                value={repairedBy}
                maxLength={100}
                onChange={(event) => setRepairedBy(event.target.value)}
                placeholder="VD: Tổ anh Lực"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="work-from">Lấy hàng Chờ sửa tại</Label>
              <select
                id="work-from"
                value={fromLocationId}
                onChange={(event) => void changeSource(event.target.value)}
                className="h-11 rounded-md border border-input bg-card px-3 text-base"
              >
                {sources.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name} · {place.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="work-note">Ghi chú</Label>
              <Input
                id="work-note"
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </section>
          <section
            aria-labelledby="work-items"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="work-items" className="font-display text-h2">
              Hàng đem sửa
            </h2>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chọn mã ở danh sách “Đang chờ sửa” để thêm.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {lines.map((line, index) => {
                  const found = byId.get(line.itemId);
                  const unit = found?.unit ?? "PIECE";
                  return (
                    <li
                      key={line.itemId}
                      className="flex flex-wrap items-end gap-3 rounded-md border p-3"
                    >
                      <span className="min-w-48 flex-1">
                        <span className="font-semibold">{found?.itemName}</span>
                        <span className="block text-caption text-muted-foreground">
                          {found?.itemCode} · đang chờ sửa{" "}
                          {formatQuantity(
                            toQuantity(found?.onHandMilli ?? 0, unit),
                          )}{" "}
                          {QUANTITY_UNIT_LABELS[unit]}
                        </span>
                      </span>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`work-taken-${index}`}>Lấy ra</Label>
                        <NumericInput
                          id={`work-taken-${index}`}
                          kind="count"
                          value={line.taken}
                          className="w-28 text-right"
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((other, at) =>
                                at === index
                                  ? { ...other, taken: event.target.value }
                                  : other,
                              ),
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setLines((current) =>
                            current.filter((_, at) => at !== index),
                          )
                        }
                      >
                        Bỏ
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
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
            <Button
              type="button"
              disabled={pending || lines.length === 0}
              onClick={() => void assign()}
            >
              Giao xưởng
            </Button>
            {draft ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void remove()}
              >
                Xóa nháp
              </Button>
            ) : null}
          </div>
        </div>
        <AwaitingList
          placeName={sourceName}
          items={items}
          added={new Set(lines.map((line) => line.itemId))}
          onAdd={(itemId) =>
            setLines((current) => [...current, { itemId, taken: "" }])
          }
        />
      </div>
    </form>
  );
}
