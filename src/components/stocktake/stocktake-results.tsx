"use client";

// D13 "Kết quả đếm" and its approval bar (spec stocktakes "Kết quả kiểm kê
// trên D13", "Duyệt là ghi sổ điều chỉnh", "Yêu cầu đếm lại một số dòng",
// "Trả lại phiên"). The tab lives in the URL; the chosen lines and typed
// unit costs live here until the director acts.
import Link from "next/link";
import { useState } from "react";

import { ConfirmAction } from "@/components/catalog/confirm-action";
import { FormError } from "@/components/catalog/form-error";
import { useCatalogAction } from "@/components/catalog/use-catalog-action";
import { ConditionBadge } from "@/components/domain/condition-badge";
import { ToneBadge } from "@/components/domain/tone-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Condition } from "@/domain/condition";
import { formatMoney, parseMoney, toMoney } from "@/domain/money";
import type { QuantityUnit } from "@/domain/quantity";
import {
  flagLabel,
  type StocktakeFlag,
  type StocktakeStatus,
} from "@/domain/stocktake";
import { DomainValueError } from "@/domain/errors";
import { cn } from "@/lib/utils";

import { quantityText, signedMoney, signedQuantity } from "./format";
import { NumericInput } from "@/components/domain/numeric-input";
import { ReasonDialog } from "./reason-dialog";

export interface ResultRow {
  id: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  condition: Condition;
  bookMilli: number | null;
  countedMilli: number | null;
  differenceMilli: number | null;
  unitCost: number | null;
  /** The director has to type a cost before approving (never priced). */
  needsCost: boolean;
  value: number | null;
  flags: StocktakeFlag[];
  recount: boolean;
}

export type ResultFilter = "diff" | "match" | "all";

interface StocktakeResultsProps {
  code: string;
  status: StocktakeStatus;
  filter: ResultFilter;
  rows: ResultRow[];
  canApprove: boolean;
  counterName: string;
}

const cell = "border-b px-3 py-2.5";
const number = `${cell} text-right tabular-nums whitespace-nowrap`;

function matches(row: ResultRow, filter: ResultFilter): boolean {
  if (filter === "all") return true;
  if (row.differenceMilli === null) return false;
  return filter === "diff"
    ? row.differenceMilli !== 0
    : row.differenceMilli === 0;
}

export function StocktakeResults({
  code,
  status,
  filter,
  rows,
  canApprove,
  counterName,
}: StocktakeResultsProps) {
  const action = useCatalogAction();
  const [chosen, setChosen] = useState<string[]>([]);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [costError, setCostError] = useState<string | null>(null);
  const deciding = canApprove && status === "SUBMITTED";
  const base = `/api/stocktakes/${encodeURIComponent(code)}`;

  const counts = {
    diff: rows.filter((row) => matches(row, "diff")).length,
    match: rows.filter((row) => matches(row, "match")).length,
    all: rows.length,
  };
  const shown = rows.filter((row) => matches(row, filter));
  const total = shown.reduce((sum, row) => sum + (row.value ?? 0), 0);
  const posting = rows.filter(
    (row) => row.differenceMilli !== null && row.differenceMilli !== 0,
  ).length;

  function typedCosts(): Record<string, number> | null {
    const result: Record<string, number> = {};
    for (const row of rows.filter((line) => line.needsCost)) {
      const text = costs[row.id]?.trim() ?? "";
      if (text === "") continue;
      try {
        const value = parseMoney(text);
        if (value < 0) throw new DomainValueError("Đơn giá không được âm");
        result[row.id] = value;
      } catch (error) {
        setCostError(
          `${row.itemCode}: ${error instanceof Error ? error.message : "Đơn giá không hợp lệ"}`,
        );
        return null;
      }
    }
    setCostError(null);
    return result;
  }

  const tab = (key: ResultFilter, label: string) => (
    <Link
      key={key}
      href={`?filter=${key}`}
      aria-current={filter === key ? "page" : undefined}
      scroll={false}
      className={cn(
        "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium",
        filter === key
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <section
        aria-labelledby="results-title"
        className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="results-title" className="text-h3">
            Kết quả đếm
          </h2>
          <nav aria-label="Lọc dòng" className="flex flex-wrap gap-1 border-b">
            {tab("diff", `Dòng lệch (${counts.diff})`)}
            {tab("match", `Khớp (${counts.match})`)}
            {tab("all", `Tất cả (${counts.all})`)}
          </nav>
        </div>
        <div className="relative overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted text-left">
              <tr>
                {deciding && (
                  <th scope="col" className={cell}>
                    <span className="sr-only">Chọn dòng</span>
                  </th>
                )}
                {[
                  "Hàng",
                  "Tình trạng",
                  "Sổ lúc đếm",
                  "Đếm thực tế",
                  "Chênh lệch",
                  "Giá BQ",
                  "Giá trị lệch",
                  "Cảnh báo",
                ].map((label, index) => (
                  <th
                    key={label}
                    scope="col"
                    className={cn(
                      `${cell} font-semibold`,
                      index >= 2 && index <= 6 && "text-right",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const isCounted = row.differenceMilli !== null;
                return (
                  <tr key={row.id} className="bg-card hover:bg-muted">
                    {deciding && (
                      <td className={cell}>
                        {isCounted && (
                          <Checkbox
                            aria-label={`Chọn ${row.itemCode} ${row.condition}`}
                            checked={chosen.includes(row.id)}
                            onCheckedChange={(value) =>
                              setChosen((current) =>
                                value === true
                                  ? [...current, row.id]
                                  : current.filter((id) => id !== row.id),
                              )
                            }
                          />
                        )}
                      </td>
                    )}
                    <th scope="row" className={`${cell} text-left font-normal`}>
                      <span className="flex flex-col">
                        <span className="font-semibold">{row.itemName}</span>
                        <span className="text-caption text-muted-foreground">
                          {row.itemCode}
                        </span>
                      </span>
                    </th>
                    <td className={cell}>
                      <ConditionBadge condition={row.condition} />
                    </td>
                    <td className={number}>
                      {quantityText(row.bookMilli, row.unit)}
                    </td>
                    <td className={number}>
                      {quantityText(row.countedMilli, row.unit)}
                    </td>
                    <td
                      className={cn(
                        number,
                        "font-semibold",
                        (row.differenceMilli ?? 0) < 0 && "text-destructive",
                        (row.differenceMilli ?? 0) > 0 && "text-success",
                      )}
                    >
                      {row.differenceMilli === null
                        ? "–"
                        : signedQuantity(row.differenceMilli, row.unit)}
                    </td>
                    <td className={number}>
                      {deciding && row.needsCost ? (
                        <NumericInput
                          aria-label={`Đơn giá ${row.itemCode}`}
                          kind="money"
                          placeholder="Nhập đơn giá"
                          value={costs[row.id] ?? ""}
                          onChange={(event) =>
                            setCosts((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                          className="h-9 w-36 text-right"
                        />
                      ) : row.unitCost === null ? (
                        "–"
                      ) : (
                        formatMoney(toMoney(row.unitCost))
                      )}
                    </td>
                    <td className={number}>
                      {row.value === null ? "–" : signedMoney(row.value)}
                    </td>
                    <td className={cell}>
                      <span className="flex flex-wrap gap-1">
                        {!isCounted ? (
                          <ToneBadge tone="muted">
                            {row.recount ? "Đang đếm lại" : "Chưa đếm"}
                          </ToneBadge>
                        ) : row.flags.length === 0 ? (
                          "–"
                        ) : (
                          row.flags.map((flag) => (
                            <ToneBadge key={flag} tone="warning">
                              {flagLabel(flag, {
                                countedMilli: row.countedMilli ?? 0,
                                bookMilli: row.bookMilli ?? 0,
                              })}
                            </ToneBadge>
                          ))
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td
                    colSpan={deciding ? 9 : 8}
                    className={`${cell} text-muted-foreground`}
                  >
                    Không có dòng nào.
                  </td>
                </tr>
              )}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr className="bg-muted font-semibold">
                  <td colSpan={deciding ? 7 : 6} className={cell}>
                    Cộng
                  </td>
                  <td className={number}>{signedMoney(total)}</td>
                  <td className={cell} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {status !== "DONE" && status !== "CANCELLED" && (
          <p className="text-sm text-muted-foreground">
            Duyệt sẽ ghi <strong>{posting} dòng</strong> điều chỉnh vào sổ kho (
            <code>ADJUST_OUT</code> cho thiếu, <code>ADJUST_IN</code> cho thừa)
            theo giá BQ lúc duyệt. Giá BQ không đổi. Dòng khớp và dòng chưa đếm
            không ghi gì.
          </p>
        )}
      </section>

      {deciding && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-md">
          <p className="text-sm">
            {chosen.length > 0 ? (
              <>
                <strong>{chosen.length} dòng</strong> được chọn để đếm lại. Gửi
                lại về điện thoại của {counterName}; các dòng khác giữ nguyên.
              </>
            ) : (
              <>Người đếm: {counterName}. Chọn dòng nếu cần đếm lại.</>
            )}
          </p>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              <ReasonDialog
                trigger={<Button variant="outline">Trả lại</Button>}
                title={`Trả lại ${code}`}
                description="Phiên về điện thoại, giữ mọi số đã đếm. Ghi rõ cần đếm lại chỗ nào."
                label="Lý do trả lại"
                confirmLabel="Trả lại"
                pending={action.pending}
                error={action.error}
                onConfirm={async (reason) =>
                  Boolean(
                    await action.run(`${base}/return`, {
                      method: "POST",
                      body: { reason },
                    }),
                  )
                }
              />
              <Button
                variant="outline"
                disabled={chosen.length === 0 || action.pending}
                onClick={async () => {
                  const done = await action.run(`${base}/recount`, {
                    method: "POST",
                    body: { lineIds: chosen },
                  });
                  if (done) setChosen([]);
                }}
              >
                Yêu cầu đếm lại {chosen.length} dòng
              </Button>
              <ConfirmAction
                trigger={
                  <Button disabled={action.pending}>Duyệt và ghi sổ</Button>
                }
                title={`Duyệt ${code}?`}
                description={`Ghi ${posting} dòng điều chỉnh vào sổ kho ngay. Phiên không sửa được nữa.`}
                confirmLabel="Duyệt và ghi sổ"
                error={action.error ?? costError}
                onConfirm={async () => {
                  const unitCosts = typedCosts();
                  if (!unitCosts) return false;
                  return Boolean(
                    await action.run(`${base}/approve`, {
                      method: "POST",
                      body: { unitCosts },
                    }),
                  );
                }}
              />
            </div>
            <FormError message={action.error ?? costError} />
          </div>
        </div>
      )}
    </>
  );
}
