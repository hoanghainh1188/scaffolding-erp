import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { StocktakeCancel } from "@/components/stocktake/stocktake-cancel";
import {
  signedMoney,
  signedQuantities,
  signedQuantity,
} from "@/components/stocktake/format";
import {
  StocktakeResults,
  type ResultFilter,
} from "@/components/stocktake/stocktake-results";
import { StocktakeStatusBadge } from "@/components/stocktake/stocktake-status-badge";
import { getDatabase } from "@/db/client";
import { formatDateTime } from "@/domain/business-date";
import { CONDITION_LABELS } from "@/domain/condition";
import { formatMoney, toMoney } from "@/domain/money";
import { can } from "@/domain/permissions";
import { quantityFromDb } from "@/domain/quantity";
import { requirePermission } from "@/lib/auth/guard";
import { getStocktake } from "@/lib/stocktakes/queries";
import { STOCKTAKE_CODE } from "@/lib/stocktakes/respond";

type Params = Promise<{ code: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { code } = await params;
  return { title: `Kiểm kê ${code}` };
}

const FILTERS: readonly ResultFilter[] = ["diff", "match", "all"];

function Tile({
  title,
  value,
  note,
  tone,
}: {
  title: string;
  value: string;
  note: string;
  tone?: "destructive" | "success" | "warning";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <span className="text-sm text-muted-foreground">{title}</span>
      <span
        className={
          tone === "destructive"
            ? "font-display text-h2 text-destructive tabular-nums"
            : tone === "success"
              ? "font-display text-h2 text-success tabular-nums"
              : tone === "warning"
                ? "font-display text-h2 text-warning tabular-nums"
                : "font-display text-h2 tabular-nums"
        }
      >
        {value}
      </span>
      <span className="text-sm text-muted-foreground tabular-nums">{note}</span>
    </div>
  );
}

/** D13 "Kết quả kiểm kê" (spec stocktakes "Kết quả kiểm kê trên D13"). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await requirePermission("inventory.view");
  const { code } = await params;
  const search = await searchParams;
  await connection();
  const detail = STOCKTAKE_CODE.test(code)
    ? await getStocktake(getDatabase(), code)
    : null;
  if (!detail) notFound();
  const canApprove = can(user.role, "inventory.approve");
  const filter: ResultFilter = FILTERS.includes(search.filter as ResultFilter)
    ? (search.filter as ResultFilter)
    : "diff";
  const { summary } = detail;
  const blind = detail.status === "COUNTING";

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6 pb-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/inventory/stocktakes" className="hover:underline">
          Kiểm kê
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">{detail.code}</span>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-h1">Kiểm kê {detail.code}</h1>
          <StocktakeStatusBadge status={detail.status} />
        </div>
        {canApprove &&
          (detail.status === "COUNTING" || detail.status === "SUBMITTED") && (
            <StocktakeCancel code={detail.code} />
          )}
      </div>

      {detail.status === "CANCELLED" && detail.cancelReason && (
        <p className="rounded-md bg-muted px-4 py-3 text-sm">
          Đã hủy: {detail.cancelReason}
        </p>
      )}
      {detail.status === "COUNTING" && detail.returnedReason && (
        <p className="rounded-md border-2 border-warning bg-card px-4 py-3 text-sm">
          Đã trả lại: {detail.returnedReason}
        </p>
      )}

      <section
        aria-labelledby="info-title"
        className="flex flex-col gap-3 rounded-lg border bg-card p-5"
      >
        <h2 id="info-title" className="text-h3">
          Thông tin phiên
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
          {[
            ["Vị trí", `${detail.locationCode} · ${detail.locationName}`],
            ["Người đếm", detail.startedByName],
            ["Bắt đầu", formatDateTime(detail.startedAt)],
            [
              "Gửi văn phòng",
              detail.submittedAt ? formatDateTime(detail.submittedAt) : "–",
            ],
            ["Phạm vi", detail.scope?.join(", ") ?? "Tất cả mã có tồn"],
            ["Đã đếm", `${summary.counted} / ${summary.total} dòng`],
            ...(detail.approvedAt
              ? [
                  [
                    "Duyệt",
                    `${detail.approvedByName ?? ""} · ${formatDateTime(detail.approvedAt)}`,
                  ],
                ]
              : []),
          ].map(([term, value]) => (
            <div key={term} className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{term}</dt>
              {/* Times and dates change each run: masked in screenshots. */}
              <dd
                data-mask={/\d\d:\d\d/.test(value ?? "") ? "" : undefined}
                className="font-medium tabular-nums"
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          Số sổ của mỗi dòng lấy đúng lúc thủ kho bấm &quot;Xong mã này&quot;.
          Chênh lệch = Đếm − Sổ lúc đếm.
        </p>
      </section>

      {blind ? (
        <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
          Thủ kho đang đếm ({summary.counted} / {summary.total} dòng). Kết quả
          hiện khi phiên được gửi về văn phòng.
        </p>
      ) : (
        <>
          <section
            aria-label="Tóm tắt chênh lệch"
            className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]"
          >
            <Tile
              title="Chênh lệch giá trị"
              value={signedMoney(summary.value)}
              note={`Thiếu ${signedQuantities(summary.shortage.quantity).replace("-", "")} · thừa ${signedQuantities(summary.surplus.quantity).replace("+", "")} · ${summary.shortage.lines + summary.surplus.lines} / ${summary.counted} dòng lệch`}
              tone={summary.value < 0 ? "destructive" : undefined}
            />
            <Tile
              title="Thiếu"
              value={signedQuantities(summary.shortage.quantity)}
              note={`${signedMoney(summary.shortage.value)} · ${summary.shortage.lines} dòng`}
              tone="destructive"
            />
            <Tile
              title="Thừa"
              value={signedQuantities(summary.surplus.quantity)}
              note={`${signedMoney(summary.surplus.value)} · ${summary.surplus.lines} dòng`}
              tone="success"
            />
            <Tile
              title="Khớp"
              value={`${summary.matched} dòng`}
              note="không ghi sổ"
            />
            <Tile
              title="Cần xem kỹ"
              value={`${summary.flagged} dòng`}
              note="có cờ cảnh báo"
              tone="warning"
            />
          </section>

          <StocktakeResults
            code={detail.code}
            status={detail.status}
            filter={filter}
            canApprove={canApprove}
            counterName={detail.startedByName}
            rows={detail.lines.map((line) => ({
              id: line.id,
              itemCode: line.itemCode,
              itemName: line.itemName,
              unit: line.unit,
              condition: line.condition,
              bookMilli: line.bookMilli,
              countedMilli: line.countedMilli,
              differenceMilli: line.differenceMilli,
              unitCost: line.unitCost,
              needsCost:
                (line.differenceMilli ?? 0) > 0 &&
                (line.unitCost === null || line.unitCostTyped),
              value: line.value,
              flags: line.flags,
              recount: line.recount,
            }))}
          />
        </>
      )}

      {detail.posted.length > 0 && (
        <section
          aria-labelledby="posted-title"
          className="flex flex-col gap-3 rounded-lg border bg-card p-5"
        >
          <h2 id="posted-title" className="text-h3">
            Dòng sổ kho đã ghi
          </h2>
          <ul className="flex flex-col gap-1 text-sm tabular-nums">
            {detail.posted.map((row) => (
              <li key={row.id}>
                {row.movement} · {row.itemCode}{" "}
                {CONDITION_LABELS[row.condition]} ·{" "}
                {signedQuantity(quantityFromDb(row.quantity, "KG").milli, "KG")}{" "}
                · {formatMoney(toMoney(row.unitCost))} ·{" "}
                {signedMoney(row.amount)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
