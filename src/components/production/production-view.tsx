// D20 of a production order (spec "Xem lệnh trên D20 và danh sách";
// docs/design/screens/D20-ProductionOrder.dc.html): progress, the overuse
// warning, each finished item with its materials, and the order's totals.
import type { ReactNode } from "react";

import { formatDateTime } from "@/domain/business-date";
import { formatMoney, type Money } from "@/domain/money";
import {
  OVERUSE_LIMIT_PERCENT,
  overuseText,
  type ProductionStatus,
} from "@/domain/production-order";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import type { ProductionDetail } from "@/lib/production/queries";

import { orderFigures, type LineFigure, type OrderFigures } from "./figures";
import { ProductionStatusBadge } from "./production-status-badge";

const qty = (milli: number, unit: QuantityUnit) =>
  formatQuantity(toQuantity(milli, unit));
const withUnit = (milli: number, unit: QuantityUnit) =>
  `${qty(milli, unit)} ${QUANTITY_UNIT_LABELS[unit]}`;
const day = (at: Date | null) => (at ? formatDateTime(at).slice(0, 5) : "");
const join = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" · ");

function Progress({ detail }: { detail: ProductionDetail }) {
  const { steps } = detail;
  const rows: [string, string, boolean][] = [
    ["Nháp", join(steps.created.by, day(steps.created.at)), true],
    [
      "Giao xưởng",
      steps.assigned.at ? `${day(steps.assigned.at)} · chụp định mức` : "",
      steps.assigned.at !== null,
    ],
    [
      "Xưởng nhận",
      steps.received.at ? join(detail.team, day(steps.received.at)) : "",
      steps.received.at !== null,
    ],
    ["Báo làm xong", day(steps.reported.at), steps.reported.at !== null],
    [
      "Thủ kho đếm",
      steps.counted.at
        ? join(steps.counted.by, day(steps.counted.at), detail.to.code)
        : "",
      steps.counted.at !== null,
    ],
    [
      "Giám đốc duyệt",
      steps.approved.at
        ? join(steps.approved.by, day(steps.approved.at))
        : `vượt định mức > ${OVERUSE_LIMIT_PERCENT} %`,
      steps.approved.at !== null,
    ],
    [
      "Ghi sổ",
      steps.posted.at ? join(steps.posted.by, day(steps.posted.at)) : "Kế toán",
      steps.posted.at !== null,
    ],
  ];
  return (
    <ol
      aria-label="Tiến trình lệnh"
      className="grid gap-2 sm:grid-cols-4 xl:grid-cols-7"
    >
      {rows.map(([label, sub, done], index) => (
        <li
          key={label}
          aria-current={done ? undefined : "step"}
          className={`flex gap-2 rounded-md border p-3 text-sm ${done ? "bg-card" : "bg-muted text-muted-foreground"}`}
        >
          <span
            aria-hidden
            className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {index + 1}
          </span>
          <span className="flex flex-col">
            <span className="font-semibold">{label}</span>
            {sub ? (
              <span data-mask className="text-caption tabular-nums">
                {sub}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

const NEXT: Readonly<Record<ProductionStatus, string>> = {
  DRAFT: "Lệnh nháp, Kế toán giao xưởng khi xong.",
  ASSIGNED: "Đã giao, chờ xưởng nhận lệnh trên điện thoại.",
  IN_PROGRESS: "Xưởng đang làm.",
  AWAITING_CHECK: "Xưởng đã báo làm xong, chờ Thủ kho đếm.",
  AWAITING_APPROVAL: "Có nguyên liệu vượt định mức, chờ Giám đốc duyệt.",
  COUNTED: "Thủ kho đã đếm, chờ Kế toán ghi sổ.",
  POSTED: "Đã ghi sổ kho.",
  CANCELLED: "Đã hủy.",
};

function Notice({
  tone,
  children,
}: {
  tone: "warning" | "muted";
  children: ReactNode;
}) {
  return (
    <p
      className={`rounded-md border px-4 py-3 text-sm ${tone === "warning" ? "border-warning bg-card" : "bg-muted"}`}
    >
      {children}
    </p>
  );
}

function overItems(figures: OrderFigures) {
  return figures.lines.flatMap((line) =>
    line.materials
      .filter((material) => material.over)
      .map((material) => ({ line, material })),
  );
}

function OveruseWarning({ figures }: { figures: OrderFigures }) {
  const items = overItems(figures);
  if (items.length === 0) return null;
  const text = items
    .map(
      ({ line, material }) =>
        `${material.name} của ${line.line.code} dùng ${withUnit(material.actualMilli ?? 0, material.unit)} so với ${withUnit(material.normMilli, material.unit)} (${overuseText(material.percentTenths)})`,
    )
    .join("; ");
  return (
    <div className="rounded-md border border-warning bg-card px-4 py-3 text-sm">
      <p>
        <strong>Vượt định mức quá {OVERUSE_LIMIT_PERCENT} %:</strong> {text}.
        Giá trị dùng vượt cả lệnh:{" "}
        <span data-mask>{formatMoney(figures.totals.overuse)}</span>. Giám đốc
        duyệt thì Kế toán mới ghi sổ được.
      </p>
    </div>
  );
}

const SOURCE: Readonly<Record<LineFigure["source"], string>> = {
  count: "Thủ kho đếm",
  report: "Xưởng báo",
  plan: "Kế hoạch",
};

function finishedText(figure: LineFigure): string {
  const { line } = figure;
  const counted = withUnit(figure.finishedMilli, line.unit);
  return figure.source === "count" &&
    line.reportedFinishedMilli !== null &&
    line.reportedFinishedMilli !== line.finishedMilli
    ? `${counted} (xưởng báo ${qty(line.reportedFinishedMilli, line.unit)})`
    : counted;
}

function Figure({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{term}</dt>
      <dd data-mask className="text-right font-medium tabular-nums">
        {children}
      </dd>
    </div>
  );
}

function ThRight({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="border-b px-3 py-2 text-right font-semibold">
      {children}
    </th>
  );
}

function LineSection({
  figure,
  scrapPrice,
  provisional,
}: {
  figure: LineFigure;
  scrapPrice: Money | null;
  provisional: boolean;
}) {
  const { line } = figure;
  const pieces = qty(figure.finishedMilli, line.unit);
  return (
    <section
      aria-label={line.name}
      className="flex flex-col gap-3 rounded-md border p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex flex-col">
          <strong>{line.name}</strong>
          <span className="text-caption text-muted-foreground">
            {line.code} · kế hoạch {withUnit(line.plannedMilli, line.unit)} ·
            Mới
          </span>
        </span>
        <span className="text-sm">
          Làm xong ({SOURCE[figure.source]}):{" "}
          <strong className="tabular-nums">{finishedText(figure)}</strong>
        </span>
      </div>
      {line.missingBom ? (
        <Notice tone="warning">{line.code} chưa có định mức</Notice>
      ) : null}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th scope="col" className="border-b px-3 py-2 font-semibold">
                Nguyên liệu
              </th>
              <ThRight>Định mức</ThRight>
              <ThRight>Thực dùng</ThRight>
              <ThRight>Chênh</ThRight>
              <ThRight>Giá trị (giá BQ)</ThRight>
            </tr>
          </thead>
          <tbody>
            {figure.materials.map((material) => (
              <tr key={material.itemId}>
                <th scope="row" className="border-b px-3 py-2 text-left">
                  <span className="font-medium">{material.name}</span>
                  <br />
                  <span className="text-caption font-normal text-muted-foreground">
                    {material.code} · {QUANTITY_UNIT_LABELS[material.unit]}
                  </span>
                </th>
                <td className="border-b px-3 py-2 text-right tabular-nums">
                  {qty(material.normMilli, material.unit)}
                </td>
                <td className="border-b px-3 py-2 text-right tabular-nums">
                  {material.actualMilli === null
                    ? "—"
                    : qty(material.actualMilli, material.unit)}
                  {material.reportedOtherMilli !== null ? (
                    <span className="block text-caption text-muted-foreground">
                      xưởng báo{" "}
                      {qty(material.reportedOtherMilli, material.unit)}
                    </span>
                  ) : null}
                </td>
                <td
                  className={`border-b px-3 py-2 text-right tabular-nums ${material.over ? "font-semibold text-warning" : ""}`}
                >
                  {material.actualMilli === null
                    ? "—"
                    : overuseText(material.percentTenths)}
                </td>
                <td
                  data-mask
                  className="border-b px-3 py-2 text-right tabular-nums"
                >
                  {formatMoney(material.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="flex flex-col gap-1 text-sm">
        <Figure term="Công khoán">
          {pieces} × {formatMoney(line.laborRate ?? (0 as Money))} ={" "}
          {formatMoney(figure.laborAmount)}
        </Figure>
        <Figure term="Trừ đầu thừa → Phế liệu">
          − {qty(figure.offcutMilli, "KG")} kg ×{" "}
          {scrapPrice === null ? "—" : formatMoney(scrapPrice)} = −{" "}
          {formatMoney(figure.offcutAmount)}
        </Figure>
        <Figure term={`Giá trị thành phẩm${provisional ? " (tạm tính)" : ""}`}>
          {formatMoney(figure.finishedAmount)}
        </Figure>
        <Figure term="Giá vốn / cái">
          {figure.unitCost === null ? "—" : formatMoney(figure.unitCost)}
        </Figure>
      </dl>
    </section>
  );
}

interface ProductionViewProps {
  detail: ProductionDetail;
  actions?: ReactNode;
}

export function ProductionView({ detail, actions }: ProductionViewProps) {
  const figures = orderFigures(detail);
  const { totals, provisional } = figures;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Lệnh sản xuất {detail.code}</h1>
          <p className="text-sm text-muted-foreground">
            Xưởng {detail.workshop.code}
            {detail.team ? ` · ${detail.team}` : ""} · nhập thành phẩm về{" "}
            {detail.to.code} · nguyên liệu lấy ở xưởng. {NEXT[detail.status]}
          </p>
        </div>
        <ProductionStatusBadge status={detail.status} />
      </div>
      <Progress detail={detail} />
      {detail.status === "AWAITING_APPROVAL" || detail.status === "COUNTED" ? (
        <OveruseWarning figures={figures} />
      ) : null}
      {detail.status === "IN_PROGRESS" && detail.returnNote ? (
        <Notice tone="warning">Văn phòng trả lại: {detail.returnNote}</Notice>
      ) : null}
      {detail.approveNote ? (
        <Notice tone="muted">
          {detail.steps.approved.by} duyệt lúc{" "}
          <span data-mask>
            {detail.steps.approved.at
              ? formatDateTime(detail.steps.approved.at)
              : ""}
          </span>
          : {detail.approveNote}
        </Notice>
      ) : null}
      {detail.cancelReason ? (
        <Notice tone="muted">Lý do hủy: {detail.cancelReason}</Notice>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section
          aria-labelledby="production-lines"
          className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="production-lines" className="font-display text-h2">
            Thành phẩm, nguyên liệu và giá vốn
          </h2>
          {figures.lines.map((figure) => (
            <LineSection
              key={figure.line.lineId}
              figure={figure}
              scrapPrice={detail.scrapPricePerKg}
              provisional={provisional}
            />
          ))}
          <p className="text-caption text-muted-foreground">
            {detail.status === "IN_PROGRESS" ? "Xưởng đang làm. " : ""}
            Định mức chụp lúc giao xưởng. Thực dùng do xưởng ghi, Thủ kho đếm
            lại. Giá trị thành phẩm = nguyên liệu (giá BQ) + công − đầu thừa (kg
            × giá sắt vụn). Giá vốn làm tròn đến 1 ₫.
          </p>
        </section>
        <aside aria-label="Duyệt và ghi sổ" className="flex flex-col gap-4">
          <section
            aria-labelledby="production-value"
            className="flex flex-col gap-1 rounded-lg border bg-card p-5"
          >
            <h2
              id="production-value"
              className="text-label text-muted-foreground"
            >
              Giá trị thành phẩm{provisional ? " (tạm tính)" : ""}
            </h2>
            <p data-mask className="font-display text-h1 tabular-nums">
              {formatMoney(totals.finished)}
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {qty(totals.finishedMilli, "PIECE")} cái Mới về {detail.to.code} ·{" "}
              {qty(totals.offcutMilli, "KG")} kg phế liệu
            </p>
          </section>
          <section
            aria-labelledby="production-total"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="production-total" className="text-h3 font-display">
              Tổng lệnh
            </h2>
            <dl className="flex flex-col gap-1.5 text-sm">
              <Figure term="Nguyên liệu">{formatMoney(totals.material)}</Figure>
              <Figure term="Công khoán">{formatMoney(totals.labor)}</Figure>
              <Figure
                term={`Đầu thừa → Phế liệu (${qty(totals.offcutMilli, "KG")} kg)`}
              >
                − {formatMoney(totals.offcut)}
              </Figure>
              <Figure term="Giá trị thành phẩm">
                {formatMoney(totals.finished)}
              </Figure>
              <Figure term="Trong đó dùng vượt định mức">
                {formatMoney(totals.overuse)}
              </Figure>
            </dl>
            {actions}
          </section>
          {detail.status !== "POSTED" && detail.status !== "CANCELLED" ? (
            <section
              aria-labelledby="production-ledger"
              className="flex flex-col gap-2 rounded-lg border bg-card p-5"
            >
              <h2 id="production-ledger" className="text-h3 font-display">
                Khi ghi sổ
              </h2>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
                <li>
                  Xuất nguyên liệu ở {detail.workshop.code} theo giá BQ, Mới
                  trước rồi Tốt.
                </li>
                <li>
                  Nhập{" "}
                  {figures.lines
                    .map(
                      (figure) =>
                        `${qty(figure.finishedMilli, figure.line.unit)} ${figure.line.code}`,
                    )
                    .join(" và ")}{" "}
                  tình trạng Mới ở {detail.to.code}.
                </li>
                {totals.offcutMilli > 0 ? (
                  <li>
                    Nhập {qty(totals.offcutMilli, "KG")} kg Phế liệu ở{" "}
                    {detail.to.code} theo giá sắt vụn.
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
