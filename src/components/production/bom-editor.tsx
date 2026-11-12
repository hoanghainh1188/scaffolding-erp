"use client";

// D19 "Định mức sản xuất" (spec production-boms;
// docs/design/screens/D19-ProductionBom.dc.html): the items with a BOM on the
// left, the chosen one on the right with today's estimate.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DomainValueError } from "@/domain/errors";
import { formatMoney, parseMoney, toMoney } from "@/domain/money";
import { bomEstimate } from "@/domain/production-bom";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  formatQuantityForInput,
  parseQuantity,
  quantityToDb,
  toQuantity,
} from "@/domain/quantity";
import { callApi } from "@/lib/api-client";
import { NumericInput } from "@/components/domain/numeric-input";
import type {
  BomDetail,
  BomListRow,
  ItemChoice,
  MaterialChoice,
} from "@/lib/production/queries";

interface Target {
  code: string;
  name: string;
}

interface BomEditorProps {
  rows: BomListRow[];
  /** The BOM open on the right; null for a new one. */
  bom: BomDetail | null;
  /** The item being given its first BOM. */
  creating: Target | null;
  candidates: ItemChoice[];
  materials: MaterialChoice[];
  canManage: boolean;
}

interface Row {
  itemId: string;
  quantity: string;
}

function perUnitMilli(text: string): number | null {
  try {
    return parseQuantity(text, "KG").milli;
  } catch (error: unknown) {
    if (error instanceof DomainValueError) return null;
    throw error;
  }
}

function moneyOf(text: string): number | null {
  try {
    return parseMoney(text);
  } catch (error: unknown) {
    if (error instanceof DomainValueError) return null;
    throw error;
  }
}

function BomForm({
  target,
  bom,
  materials,
  canManage,
}: {
  target: Target;
  bom: BomDetail | null;
  materials: MaterialChoice[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(
    bom?.materials.map((material) => ({
      itemId: material.itemId,
      quantity: formatQuantityForInput(toQuantity(material.perUnitMilli, "KG")),
    })) ?? [],
  );
  const [labor, setLabor] = useState(bom ? String(bom.laborRate) : "");
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const known = new Map<string, MaterialChoice>(
    materials.map((material) => [material.itemId, material]),
  );
  for (const material of bom?.materials ?? []) {
    if (!known.has(material.itemId)) known.set(material.itemId, material);
  }
  const estimate = bomEstimate(
    rows.map((row) => ({
      perUnitMilli: perUnitMilli(row.quantity) ?? 0,
      newAvg: known.get(row.itemId)?.newAvg ?? null,
      goodAvg: known.get(row.itemId)?.goodAvg ?? null,
    })),
    toMoney(moneyOf(labor) ?? 0),
  );
  const unused = materials.filter(
    (material) => !rows.some((row) => row.itemId === material.itemId),
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const laborRate = moneyOf(labor);
    const result = await callApi(
      `/api/production/boms/${encodeURIComponent(target.code)}`,
      {
        method: "PUT",
        body: {
          laborRate: laborRate ?? -1,
          materials: rows.map((row) => {
            const milli = perUnitMilli(row.quantity);
            return {
              itemId: row.itemId,
              quantity:
                milli === null ? "" : quantityToDb(toQuantity(milli, "KG")),
            };
          }),
          ...(bom ? { updatedAt: new Date(bom.updatedAt).toISOString() } : {}),
        },
      },
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/production/boms?item=${encodeURIComponent(target.code)}`);
    router.refresh();
  }

  async function remove() {
    if (!bom) return;
    setPending(true);
    const result = await callApi(
      `/api/production/boms/${encodeURIComponent(target.code)}`,
      {
        method: "DELETE",
        body: { updatedAt: new Date(bom.updatedAt).toISOString() },
      },
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/production/boms");
    router.refresh();
  }

  const change = (itemId: string, quantity: string) =>
    setRows(rows.map((r) => (r.itemId === itemId ? { ...r, quantity } : r)));

  return (
    <form
      onSubmit={(event) => void save(event)}
      aria-labelledby="bom-title"
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="bom-title" className="font-display text-h2">
          {target.name} · {target.code}
        </h2>
        <span className="text-caption text-muted-foreground">
          Thành phẩm vào tình trạng Mới
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th scope="col" className="border-b px-3 py-2 font-semibold">
                Nguyên liệu
              </th>
              <th
                scope="col"
                className="border-b px-3 py-2 text-right font-semibold"
              >
                Định mức / 1 cái
              </th>
              <th scope="col" className="border-b px-3 py-2 font-semibold">
                Đơn vị
              </th>
              <th
                scope="col"
                className="border-b px-3 py-2 text-right font-semibold"
              >
                Giá BQ hôm nay
              </th>
              <th
                scope="col"
                className="border-b px-3 py-2 text-right font-semibold"
              >
                Thành tiền
              </th>
              {canManage ? (
                <th scope="col" className="border-b px-3 py-2">
                  <span className="sr-only">Thao tác</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const material = known.get(row.itemId);
              const line = estimate.lines[index];
              if (!material) return null;
              return (
                <tr key={row.itemId}>
                  <th scope="row" className="border-b px-3 py-2 text-left">
                    <span className="font-medium">{material.name}</span>
                    <br />
                    <span className="text-caption font-normal text-muted-foreground">
                      {material.code}
                    </span>
                  </th>
                  <td className="border-b px-3 py-2 text-right tabular-nums">
                    {canManage ? (
                      <NumericInput
                        aria-label={`Định mức ${material.code}`}
                        value={row.quantity}
                        kind="decimal"
                        className="ml-auto w-28 text-right"
                        onChange={(event) =>
                          change(row.itemId, event.target.value)
                        }
                      />
                    ) : (
                      formatQuantity(
                        toQuantity(perUnitMilli(row.quantity) ?? 0, "KG"),
                      )
                    )}
                  </td>
                  <td className="border-b px-3 py-2">
                    {QUANTITY_UNIT_LABELS[material.unit]}
                  </td>
                  <td
                    data-mask
                    className="border-b px-3 py-2 text-right tabular-nums"
                  >
                    {line?.unitPrice == null
                      ? "—"
                      : formatMoney(line.unitPrice)}
                  </td>
                  <td
                    data-mask
                    className="border-b px-3 py-2 text-right tabular-nums"
                  >
                    {line?.amount == null ? "—" : formatMoney(line.amount)}
                  </td>
                  {canManage ? (
                    <td className="border-b px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Bỏ ${material.code}`}
                        onClick={() =>
                          setRows(rows.filter((r) => r.itemId !== row.itemId))
                        }
                      >
                        Bỏ
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canManage ? (
        adding ? (
          <select
            aria-label="Chọn nguyên liệu"
            className="h-11 self-start rounded-md border bg-card px-3 text-base"
            defaultValue=""
            onChange={(event) => {
              if (!event.target.value) return;
              setRows([...rows, { itemId: event.target.value, quantity: "" }]);
              setAdding(false);
            }}
          >
            <option value="">Chọn nguyên liệu</option>
            {unused.map((material) => (
              <option key={material.itemId} value={material.itemId}>
                {material.code} · {material.name}
              </option>
            ))}
          </select>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={unused.length === 0}
            onClick={() => setAdding(true)}
          >
            + Thêm nguyên liệu (mã nhóm Vật tư)
          </Button>
        )
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex w-64 flex-col gap-1.5">
          <Label htmlFor="bom-labor">Đơn giá công sản xuất / cái</Label>
          {canManage ? (
            <NumericInput
              id="bom-labor"
              kind="money"
              value={labor}
              onChange={(event) => setLabor(event.target.value)}
            />
          ) : (
            <p id="bom-labor" className="tabular-nums">
              {formatMoney(estimate.labor)}
            </p>
          )}
        </div>
        <dl className="flex min-w-64 flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">Nguyên liệu</dt>
            <dd data-mask className="tabular-nums">
              {estimate.total === null
                ? "chưa đủ giá"
                : formatMoney(estimate.materials)}
            </dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">Công</dt>
            <dd className="tabular-nums">{formatMoney(estimate.labor)}</dd>
          </div>
          <div className="flex justify-between gap-6 border-t pt-1.5 font-semibold">
            <dt>Giá thành dự tính / cái</dt>
            <dd data-mask className="tabular-nums">
              {estimate.total === null
                ? "chưa đủ giá"
                : formatMoney(estimate.total)}
            </dd>
          </div>
        </dl>
      </div>
      <p className="text-caption text-muted-foreground">
        Giá thành dự tính theo giá BQ hôm nay, chỉ để tham khảo. Giá thật tính
        lúc ghi sổ lệnh từ số thực dùng.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {canManage ? (
        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            Lưu định mức
          </Button>
          {bom ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => void remove()}
            >
              Xóa định mức
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export function BomEditor({
  rows,
  bom,
  creating,
  candidates,
  materials,
  canManage,
}: BomEditorProps) {
  const router = useRouter();
  const [choosing, setChoosing] = useState(false);
  const target: Target | null = creating ?? (bom ? bom : null);
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav
        aria-label="Thành phẩm"
        className="flex flex-col gap-3 rounded-lg border bg-card p-4"
      >
        <h2 className="text-h3 font-display">Thành phẩm</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có định mức nào.</p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {rows.map((row) => {
            const active = target?.code === row.code;
            return (
              <li key={row.itemId}>
                <Link
                  href={`/production/boms?item=${encodeURIComponent(row.code)}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col rounded-md px-3 py-2 text-sm hover:bg-accent ${active ? "bg-accent" : ""}`}
                >
                  <strong className="font-semibold">{row.name}</strong>
                  <span className="text-caption text-muted-foreground">
                    {row.code} · {row.materialCount} nguyên liệu
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {canManage ? (
          choosing ? (
            <select
              aria-label="Chọn thành phẩm"
              className="h-11 rounded-md border bg-card px-3 text-base"
              defaultValue=""
              onChange={(event) => {
                if (!event.target.value) return;
                setChoosing(false);
                router.push(
                  `/production/boms?new=${encodeURIComponent(event.target.value)}`,
                );
              }}
            >
              <option value="">Chọn thành phẩm</option>
              {candidates.map((item) => (
                <option key={item.itemId} value={item.code}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setChoosing(true)}
            >
              + Thêm định mức
            </Button>
          )
        ) : null}
      </nav>
      {target ? (
        <BomForm
          key={`${target.code}-${bom ? new Date(bom.updatedAt).getTime() : "new"}`}
          target={target}
          bom={creating ? null : bom}
          materials={materials}
          canManage={canManage}
        />
      ) : (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">
          Chọn một thành phẩm để xem định mức.
        </p>
      )}
    </div>
  );
}
