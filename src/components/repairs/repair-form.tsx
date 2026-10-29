"use client";

// D12 phiếu sửa chữa (simple-repair spec "Màn D12 phiếu sửa chữa", design
// D6, D7, D11): edit a draft, save it, or save and post it in one press.
import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DateInput } from "@/components/domain/date-input";
import { ConfirmAction } from "@/components/catalog/confirm-action";
import { FormError } from "@/components/catalog/form-error";
import { FieldMessage } from "@/components/purchasing/field-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseMoney, toMoney } from "@/domain/money";
import { unconfirmedAnomalies, type Anomaly } from "@/domain/receipt-anomalies";
import {
  repairAnomalies,
  repairAnomalyKey,
  repairTotals,
} from "@/domain/repair-order";
import { callApi } from "@/lib/api-client";
import type { AwaitingRepair, RepairPlace } from "@/lib/repairs/queries";

import { AwaitingList } from "./awaiting-list";
import { CostBlock } from "./cost-block";
import { readLines, type ReadLine } from "./read-lines";
import { previewLine } from "./preview";
import { RepairAnomalyDialog } from "./repair-anomaly-dialog";
import { RepairLines, type DraftLine } from "./repair-lines";
import { RepairStatusBadge } from "./repair-status-badge";
import { RepairSummary } from "./repair-summary";

export interface EditedSlip {
  code: string;
  updatedAt: string;
  repairDate: string;
  repairedBy: string | null;
  note: string | null;
  fromLocationId: string;
  toLocationId: string;
  lines: {
    itemId: string;
    takenMilli: number;
    goodMilli: number;
    scrapMilli: number;
    repairCost: number;
  }[];
}

interface RepairFormProps {
  places: RepairPlace[];
  today: string;
  defaultLocationId: string;
  awaiting: AwaitingRepair;
  slip?: EditedSlip;
}

const STALE = "Phiếu vừa được người khác sửa, tải lại trang";
let nextKey = 1;
const key = () => (nextKey += 1);
const whole = (milli: number) => String(milli / 1000);
const grouped = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
/** "1.980.000" in the cost field, as D12 shows it. */
function costText(value: string): string {
  try {
    return grouped.format(parseMoney(value));
  } catch {
    return value;
  }
}

function emptyLine(itemId: string): DraftLine {
  return {
    key: key(),
    itemId,
    taken: "",
    good: "",
    scrap: "0",
    cost: "",
    goodTouched: false,
  };
}

type Pending = "draft" | "post" | "delete" | null;

export function RepairForm({
  places,
  today,
  defaultLocationId,
  awaiting: initialAwaiting,
  slip,
}: RepairFormProps) {
  const router = useRouter();
  const [current, setCurrent] = useState(
    slip ? { code: slip.code, updatedAt: slip.updatedAt } : null,
  );
  const [repairDate, setRepairDate] = useState(slip?.repairDate ?? today);
  const [repairedBy, setRepairedBy] = useState(slip?.repairedBy ?? "");
  const [note, setNote] = useState(slip?.note ?? "");
  const [fromId, setFromId] = useState(
    slip?.fromLocationId ?? defaultLocationId,
  );
  const [toId, setToId] = useState(slip?.toLocationId ?? defaultLocationId);
  const [awaiting, setAwaiting] = useState(initialAwaiting);
  const [lines, setLines] = useState<DraftLine[]>(
    () =>
      slip?.lines.map((line) => ({
        key: key(),
        itemId: line.itemId,
        taken: whole(line.takenMilli),
        good: whole(line.goodMilli),
        scrap: whole(line.scrapMilli),
        cost: grouped.format(line.repairCost),
        goodTouched: true,
      })) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [ask, setAsk] = useState<{
    anomaly: Anomaly;
    confirmed: string[];
  } | null>(null);

  const facts = useMemo(
    () => new Map(awaiting.items.map((item) => [item.itemId, item])),
    [awaiting],
  );
  const read = readLines(lines, facts);
  const totals = repairTotals(read.valid);
  const previews = read.rows.map((row) =>
    row.input
      ? previewLine(
          {
            itemCode: row.input.itemCode,
            itemName:
              facts.get(row.input.itemId)?.itemName ?? row.input.itemCode,
            goodMilli: row.input.goodMilli,
            scrapMilli: row.input.scrapMilli,
            repairCost: row.input.repairCost,
          },
          facts.get(row.input.itemId),
          awaiting.scrapPricePerKg,
        )
      : null,
  );
  const loss = toMoney(
    previews.reduce(
      (sum, preview) => sum + (preview?.ok ? preview.figures.loss : 0),
      0,
    ),
  );
  const added = new Set(lines.map((line) => line.itemId));
  const placeName = (id: string) =>
    places.find((place) => place.id === id)?.name.toLowerCase() ?? "";
  const canPost =
    lines.length > 0 && read.rowErrors.size === 0 && pending === null;

  function changeLine(lineKey: number, change: Partial<DraftLine>) {
    // A server message about this row is stale once the row changes.
    const row = lines.findIndex((line) => line.key === lineKey);
    setErrors((all) =>
      Object.fromEntries(
        Object.entries(all).filter(
          ([field]) => !field.startsWith(`lines.${row}.`),
        ),
      ),
    );
    setLines((all) =>
      all.map((line) => {
        if (line.key !== lineKey) return line;
        const next = { ...line, ...change };
        // Until typed in, "Sửa xong" is what is left after scrap.
        if (!next.goodTouched && ("taken" in change || "scrap" in change)) {
          const left = Number(next.taken || 0) - Number(next.scrap || 0);
          next.good = Number.isInteger(left) && left >= 0 ? String(left) : "";
        }
        return next;
      }),
    );
  }

  async function changeFrom(id: string) {
    setFromId(id);
    const query = new URLSearchParams({ locationId: id });
    for (const line of lines) query.append("itemId", line.itemId);
    const result = await callApi<AwaitingRepair>(
      `/api/repairs/awaiting?${query.toString()}`,
    );
    if (result.ok) setAwaiting(result.data);
    else setError(result.error);
  }

  function body(): unknown {
    return {
      repairDate,
      repairedBy: repairedBy || null,
      note: note || null,
      fromLocationId: fromId,
      toLocationId: toId,
      lines: read.rows.map((row: ReadLine) => row.body),
      ...(current ? { updatedAt: current.updatedAt } : {}),
    };
  }

  function fail(result: { error: string; field?: string }) {
    if (result.field) setErrors({ [result.field]: result.error });
    if (result.error === STALE) setStale(true);
    setError(result.error);
  }

  /** Saves the draft; returns it, or null after showing why not. */
  async function saveDraft(): Promise<{
    code: string;
    updatedAt: string;
  } | null> {
    const result = current
      ? await callApi<{ code: string; updatedAt: string }>(
          `/api/repairs/${current.code}`,
          { method: "PUT", body: body() },
        )
      : await callApi<{ code: string; updatedAt: string }>("/api/repairs", {
          method: "POST",
          body: body(),
        });
    if (!result.ok) {
      fail(result);
      return null;
    }
    setCurrent(result.data);
    return result.data;
  }

  async function saveOnly() {
    setErrors({});
    setError(null);
    setPending("draft");
    const saved = await saveDraft();
    setPending(null);
    if (!saved) return;
    router.push(`/repairs/${saved.code}?saved=draft`);
    router.refresh();
  }

  async function post(confirmed: string[]) {
    setErrors({});
    setError(null);
    setAsk(null);
    // Ask first, with the averages the page has (design D6).
    const [missing] = unconfirmedAnomalies(
      repairAnomalies(
        read.valid.map((line) => ({
          itemCode: line.itemCode,
          goodMilli: line.goodMilli,
          repairCost: line.repairCost,
          goodAvg: facts.get(line.itemId)?.goodAvg ?? null,
        })),
      ),
      confirmed,
    );
    if (missing) {
      setAsk({ anomaly: missing, confirmed });
      return;
    }
    setPending("post");
    const saved = await saveDraft();
    if (!saved) {
      setPending(null);
      return;
    }
    const code = saved.code;
    const result = await callApi(`/api/repairs/${code}/post`, {
      method: "POST",
      // Post exactly the draft just saved (409 if someone saved since).
      body: { confirmedOverrides: confirmed, updatedAt: saved.updatedAt },
    });
    setPending(null);
    if (!result.ok) {
      // The server read newer averages and has a question of its own.
      const row = /^lines\.(\d+)\.repairCost$/.exec(result.field ?? "");
      const line = row ? read.valid[Number(row[1])] : undefined;
      if (line && result.error.endsWith("Đúng không?")) {
        setAsk({
          anomaly: {
            key: repairAnomalyKey(line.itemCode),
            field: result.field ?? "",
            question: result.error,
            note: "",
          },
          confirmed,
        });
        return;
      }
      fail(result);
      return;
    }
    router.push(`/repairs/${code}`);
    router.refresh();
  }

  async function remove(): Promise<boolean> {
    if (!current) return true;
    setPending("delete");
    const result = await callApi(`/api/repairs/${current.code}`, {
      method: "DELETE",
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    router.push("/repairs");
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1">
            {current ? `Phiếu sửa chữa ${current.code}` : "Phiếu sửa chữa mới"}
          </h1>
          <RepairStatusBadge status="DRAFT" />
        </div>
        <div className="flex flex-wrap gap-2">
          {current ? (
            <ConfirmAction
              trigger={
                <Button variant="ghost" disabled={pending !== null}>
                  Xóa nháp
                </Button>
              }
              title={`Xóa nháp ${current.code}?`}
              description="Phiếu nháp bị xóa hẳn. Sổ kho không đổi."
              confirmLabel="Xóa nháp"
              destructive
              onConfirm={remove}
            />
          ) : null}
          <Button
            variant="outline"
            disabled={pending !== null || lines.length === 0}
            onClick={() => void saveOnly()}
          >
            Lưu nháp
          </Button>
          <Button disabled={!canPost} onClick={() => void post([])}>
            <CheckIcon aria-hidden data-icon="inline-start" />
            Ghi sổ kho
          </Button>
        </div>
      </div>
      <FormError message={error} />
      {stale ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => window.location.reload()}
        >
          Tải lại trang
        </Button>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-labelledby="repair-head-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="repair-head-title" className="font-display text-h2">
            Thông tin chung
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="repair-date">Ngày sửa xong</Label>
              <DateInput
                id="repair-date"
                data-mask
                max={today}
                value={repairDate}
                onValueChange={setRepairDate}
              />
              <p className="text-caption text-muted-foreground">
                Sổ kho ghi theo ngày ghi sổ.
              </p>
              <FieldMessage message={errors.repairDate} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="repair-by">Người/tổ sửa</Label>
              <Input
                id="repair-by"
                value={repairedBy}
                maxLength={100}
                placeholder="Tổ anh Hoàng Nam"
                onChange={(event) => setRepairedBy(event.target.value)}
              />
              <FieldMessage message={errors.repairedBy} />
            </div>
            {(
              [
                [
                  "repair-from",
                  "Lấy hàng Chờ sửa tại",
                  fromId,
                  "fromLocationId",
                ],
                ["repair-to", "Nhập Tốt, Phế liệu về", toId, "toLocationId"],
              ] as const
            ).map(([id, label, value, field]) => (
              <div key={id} className="flex flex-col gap-1.5">
                <Label htmlFor={id}>{label}</Label>
                <select
                  id={id}
                  value={value}
                  disabled={pending !== null}
                  onChange={(event) =>
                    field === "fromLocationId"
                      ? void changeFrom(event.target.value)
                      : setToId(event.target.value)
                  }
                  className="h-11 w-full rounded-md border border-input bg-card px-3 text-base"
                >
                  {places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name} · {place.code}
                    </option>
                  ))}
                </select>
                <FieldMessage message={errors[field]} />
              </div>
            ))}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label htmlFor="repair-note">Ghi chú</Label>
              <textarea
                id="repair-note"
                value={note}
                maxLength={500}
                rows={2}
                onChange={(event) => setNote(event.target.value)}
                className="rounded-md border border-input bg-card px-3 py-2 text-base"
              />
              <FieldMessage message={errors.note} />
            </div>
          </div>
        </section>
        <RepairSummary
          cost={totals.cost}
          goodMilli={totals.goodMilli}
          scrapMilli={totals.scrapMilli}
          loss={loss}
        />
      </div>

      <RepairLines
        lines={lines}
        facts={facts}
        rowErrors={read.rowErrors}
        errors={errors}
        total={totals.cost}
        choices={awaiting.items.filter(
          (item) => item.onHandMilli > 0 && !added.has(item.itemId),
        )}
        readOnly={false}
        onChange={changeLine}
        onCostBlur={(lineKey) =>
          setLines((all) =>
            all.map((line) =>
              line.key === lineKey && line.cost.trim()
                ? { ...line, cost: costText(line.cost) }
                : line,
            ),
          )
        }
        onAdd={(itemId) => setLines((all) => [...all, emptyLine(itemId)])}
        onRemove={(lineKey) =>
          setLines((all) => all.filter((line) => line.key !== lineKey))
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-labelledby="repair-cost-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="repair-cost-title" className="font-display text-h2">
            Giá vốn sau sửa
          </h2>
          {previews.every((preview) => preview === null) ? (
            <p className="text-sm text-muted-foreground">
              Nhập số lượng để xem giá vốn sau sửa.
            </p>
          ) : (
            previews.map((preview, index) =>
              preview === null ? null : preview.ok ? (
                <CostBlock key={lines[index]?.key} figures={preview.figures} />
              ) : (
                <p
                  key={lines[index]?.key}
                  className="rounded-md bg-muted px-3 py-2 text-sm"
                >
                  {facts.get(lines[index]?.itemId ?? "")?.itemName}:{" "}
                  {preview.reason}
                </p>
              ),
            )
          )}
          <p className="text-caption text-muted-foreground">
            Chi phí sửa chỉ chia cho hàng sửa xong. Giá vốn làm tròn đến 1 ₫. Số
            chính xác tính lúc ghi sổ.
          </p>
        </section>
        <AwaitingList
          placeName={placeName(fromId)}
          items={awaiting.items}
          added={added}
          disabled={pending !== null}
          onAdd={(itemId) => setLines((all) => [...all, emptyLine(itemId)])}
        />
      </div>

      <RepairAnomalyDialog
        anomaly={ask?.anomaly ?? null}
        onCancel={() => {
          if (ask) setErrors({ [ask.anomaly.field]: ask.anomaly.question });
          setAsk(null);
        }}
        onConfirm={() =>
          ask ? void post([...ask.confirmed, ask.anomaly.key]) : undefined
        }
      />
    </div>
  );
}
