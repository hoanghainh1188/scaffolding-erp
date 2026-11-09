// D12 of a repair work order (repair-work-orders spec "Màn D12 lệnh sửa
// chữa"; docs/design/screens/D12-RepairOrder.dc.html): progress, the lines
// with labour and supplies, the price into Good, the repair cost, what the
// posting will write and the supplies at the workshop.
import type { ReactNode } from "react";

import { formatDateTime } from "@/domain/business-date";
import { formatMoney, toMoney } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  formatByUnit,
  formatQuantity,
  sumByUnit,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { scrapKgMilli } from "@/domain/repair-order";
import type { WorkOrderDetail } from "@/lib/repairs/work-queries";

import { RepairStatusBadge } from "./repair-status-badge";
import { hasNumbers, laborText, workFigures } from "./work-figures";

const qty = (milli: number, unit: QuantityUnit) =>
  formatQuantity(toQuantity(milli, unit));
const withUnit = (milli: number, unit: QuantityUnit) =>
  `${qty(milli, unit)} ${QUANTITY_UNIT_LABELS[unit]}`;
const day = (at: Date | null) => (at ? formatDateTime(at).slice(0, 5) : "");

/** The sentence under the title: what comes next and who does it. */
function nextStep(detail: WorkOrderDetail): string {
  const place = `Xưởng ${detail.workshop.code}${detail.repairedBy ? ` · ${detail.repairedBy}` : ""}`;
  const next: Record<WorkOrderDetail["status"], string> = {
    DRAFT: "Lệnh nháp, Kế toán giao xưởng khi xong.",
    ASSIGNED: "Đã giao, chờ xưởng nhận lệnh trên điện thoại.",
    IN_PROGRESS: "Xưởng đang sửa, số chỉ lên khi xưởng báo sửa xong.",
    AWAITING_CHECK: "Xưởng đã báo sửa xong, chờ Thủ kho đếm lại.",
    COUNTED: "Thủ kho đã đếm, chờ Kế toán ghi sổ.",
    POSTED: "Đã ghi sổ kho.",
    CANCELLED: `Đã hủy${detail.cancelReason ? `: ${detail.cancelReason}` : ""}.`,
  };
  return `${place} · Chờ sửa → Tốt hoặc Phế liệu. ${next[detail.status]}`;
}

function Progress({ detail }: { detail: WorkOrderDetail }) {
  const { steps } = detail;
  const rows: [string, string, boolean][] = [
    [
      "Nháp",
      [steps.created.by, day(steps.created.at)].filter(Boolean).join(" · "),
      true,
    ],
    ["Giao xưởng", day(steps.assigned.at), steps.assigned.at !== null],
    [
      "Xưởng nhận",
      steps.received.at
        ? [
            detail.repairedBy,
            day(steps.received.at),
            `${detail.from.code} → ${detail.workshop.code}`,
          ]
            .filter(Boolean)
            .join(" · ")
        : "",
      steps.received.at !== null,
    ],
    ["Báo sửa xong", day(steps.reported.at), steps.reported.at !== null],
    [
      "Thủ kho đếm",
      [steps.counted.by, day(steps.counted.at)].filter(Boolean).join(" · "),
      steps.counted.at !== null,
    ],
    [
      "Ghi sổ",
      steps.posted.at
        ? [steps.posted.by, day(steps.posted.at)].filter(Boolean).join(" · ")
        : "Kế toán",
      steps.posted.at !== null,
    ],
  ];
  return (
    <ol
      aria-label="Tiến trình lệnh"
      className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6"
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

interface WorkOrderViewProps {
  detail: WorkOrderDetail;
  /** The buttons, for repairs.manage only. */
  actions?: ReactNode;
}

export function WorkOrderView({ detail, actions }: WorkOrderViewProps) {
  const numbers = hasNumbers(detail.status);
  const figures = workFigures(detail);
  const totals = {
    labor: toMoney(figures.reduce((sum, row) => sum + row.labor, 0)),
    material: toMoney(figures.reduce((sum, row) => sum + row.material, 0)),
  };
  const cost = toMoney(totals.labor + totals.material);
  const units = (pick: "takenMilli" | "goodMilli" | "scrapMilli") =>
    formatByUnit(
      sumByUnit(
        detail.lines.map((line) => ({ unit: line.unit, milli: line[pick] })),
      ),
    );
  const supplyTotals = new Map<
    string,
    { name: string; unit: QuantityUnit; milli: number }
  >();
  for (const line of detail.lines) {
    for (const material of line.materials) {
      const entry = supplyTotals.get(material.itemId) ?? {
        name: material.name.toLowerCase(),
        unit: material.unit,
        milli: 0,
      };
      entry.milli += material.quantityMilli;
      supplyTotals.set(material.itemId, entry);
    }
  }
  const problems = figures.flatMap((row) => (row.problem ? [row.problem] : []));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1">Lệnh sửa chữa {detail.code}</h1>
          <RepairStatusBadge status={detail.status} />
        </div>
        <p className="text-sm text-muted-foreground">{nextStep(detail)}</p>
      </div>
      <Progress detail={detail} />
      {detail.returnNote && detail.status === "IN_PROGRESS" ? (
        <p
          role="status"
          className="rounded-md border border-warning bg-card px-3 py-2 text-sm"
        >
          Văn phòng trả lại: {detail.returnNote}
        </p>
      ) : null}
      {detail.confirmedNote ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          {detail.confirmedNote}
        </p>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="work-lines"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 id="work-lines" className="font-display text-h2">
              Hàng sửa, công và vật tư
            </h2>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    {[
                      "Mã hàng",
                      "Lấy ra",
                      "Sửa xong",
                      "Phế liệu",
                      "Công thợ và vật tư phụ",
                      "Chi phí sửa",
                    ].map((label, index) => (
                      <th
                        key={label}
                        scope="col"
                        className={`border-b px-3 py-2.5 font-semibold ${index >= 1 && index <= 3 ? "text-right" : ""} ${index === 5 ? "text-right" : ""}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {figures.map((row) => {
                    const { line } = row;
                    const differs =
                      line.reportedGoodMilli !== null &&
                      (line.reportedGoodMilli !== line.goodMilli ||
                        line.reportedScrapMilli !== line.scrapMilli);
                    return (
                      <tr key={line.itemId} className="align-top">
                        <th
                          scope="row"
                          className="border-b px-3 py-2.5 text-left font-normal"
                        >
                          <span className="font-semibold">{line.name}</span>
                          <span className="block text-caption text-muted-foreground">
                            {line.code}
                          </span>
                        </th>
                        <td className="border-b px-3 py-2.5 text-right tabular-nums">
                          {qty(line.takenMilli, line.unit)}
                        </td>
                        <td className="border-b px-3 py-2.5 text-right tabular-nums">
                          {numbers ? qty(line.goodMilli, line.unit) : "–"}
                        </td>
                        <td className="border-b px-3 py-2.5 text-right tabular-nums">
                          {numbers ? qty(line.scrapMilli, line.unit) : "–"}
                        </td>
                        <td className="border-b px-3 py-2.5">
                          {numbers ? (
                            <div className="flex flex-col gap-1">
                              <span>
                                Công khoán:{" "}
                                {laborText(
                                  line.goodMilli,
                                  line.laborRate,
                                  row.labor,
                                )}
                              </span>
                              {row.materials.length > 0 ? (
                                <>
                                  <span className="text-muted-foreground">
                                    Vật tư phụ (giá BQ):
                                  </span>
                                  {row.materials.map((material) => (
                                    <span key={material.itemId}>
                                      {material.name} ({material.code}){" "}
                                      {withUnit(
                                        material.quantityMilli,
                                        line.materials.find(
                                          (m) => m.itemId === material.itemId,
                                        )?.unit ?? "PIECE",
                                      )}{" "}
                                      × {formatMoney(material.unitCost)} ={" "}
                                      {formatMoney(material.amount)}
                                    </span>
                                  ))}
                                </>
                              ) : null}
                              {differs ? (
                                <span className="text-caption text-muted-foreground">
                                  Xưởng báo{" "}
                                  {qty(line.reportedGoodMilli ?? 0, line.unit)}{" "}
                                  sửa xong,{" "}
                                  {qty(line.reportedScrapMilli ?? 0, line.unit)}{" "}
                                  phế
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              {detail.status === "IN_PROGRESS"
                                ? "Xưởng đang sửa"
                                : "Chưa sửa"}
                              {line.laborRate !== null
                                ? ` · công ${formatMoney(line.laborRate)} / ${QUANTITY_UNIT_LABELS[line.unit]}`
                                : ""}
                            </span>
                          )}
                        </td>
                        <td
                          data-mask
                          className="border-b px-3 py-2.5 text-right font-semibold tabular-nums"
                        >
                          {numbers ? formatMoney(row.cost) : "–"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted font-semibold">
                    <th scope="row" className="px-3 py-2.5 text-left">
                      Cộng
                    </th>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {units("takenMilli")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {numbers ? units("goodMilli") : "–"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {numbers ? units("scrapMilli") : "–"}
                    </td>
                    <td data-mask className="px-3 py-2.5">
                      {numbers
                        ? `Công ${formatMoney(totals.labor)} · vật tư ${formatMoney(totals.material)}`
                        : ""}
                    </td>
                    <td
                      data-mask
                      className="px-3 py-2.5 text-right tabular-nums"
                    >
                      {numbers ? formatMoney(cost) : "–"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-caption text-muted-foreground">
              Xưởng ghi số sửa xong, phế liệu và vật tư dùng trên điện thoại
              (M8), không thấy giá. Thủ kho đếm lại khi nghiệm thu. Đơn giá công
              khoán / cái đặt ở danh mục mã hàng (D9).
            </p>
          </section>
          {numbers ? (
            <section
              aria-labelledby="work-good"
              className="flex flex-col gap-3 rounded-lg border bg-card p-5"
            >
              <h2 id="work-good" className="font-display text-h2">
                Giá vốn khi vào Tốt
              </h2>
              {problems.length > 0 ? (
                <p role="alert" className="text-sm text-destructive">
                  {problems.join(". ")}
                </p>
              ) : null}
              {figures.map(({ line, cost: lineCost, repair }) =>
                repair ? (
                  <article
                    key={line.itemId}
                    className="flex flex-col gap-1 rounded-md border p-4 text-sm"
                  >
                    <h3 className="font-semibold">
                      {line.name} · {withUnit(line.goodMilli, line.unit)} sửa
                      xong
                    </h3>
                    {line.goodMilli > 0 ? (
                      <dl
                        data-mask
                        className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1"
                      >
                        <dt>
                          {qty(line.goodMilli, line.unit)} × giá Chờ sửa{" "}
                          {formatMoney(repair.needsRepairAvg)}
                        </dt>
                        <dd className="text-right tabular-nums">
                          {formatMoney(
                            toMoney(
                              repair.goodAmount - lineCost - repair.damage,
                            ),
                          )}
                        </dd>
                        <dt>+ Chi phí sửa (công + vật tư)</dt>
                        <dd className="text-right tabular-nums">
                          {formatMoney(lineCost)}
                        </dd>
                        <dt>
                          + Phần hỏng
                          {line.scrapMilli > 0
                            ? ` (${qty(line.scrapMilli, line.unit)} × ${formatMoney(repair.needsRepairAvg)} − phế liệu ${formatMoney(repair.scrapValue)})`
                            : ""}
                        </dt>
                        <dd className="text-right tabular-nums">
                          {formatMoney(repair.damage)}
                        </dd>
                        <dt className="font-semibold">= Giá trị vào Tốt</dt>
                        <dd className="text-right font-semibold tabular-nums">
                          {formatMoney(repair.goodAmount)}
                        </dd>
                        <dt className="font-semibold">
                          Giá vào Tốt / {QUANTITY_UNIT_LABELS[line.unit]}
                        </dt>
                        <dd className="text-right font-semibold tabular-nums">
                          {repair.goodUnitCost === null
                            ? "–"
                            : formatMoney(repair.goodUnitCost)}
                        </dd>
                      </dl>
                    ) : (
                      <p data-mask>Lỗ hỏng hàng: {formatMoney(repair.loss)}</p>
                    )}
                    <p data-mask className="text-muted-foreground">
                      {line.scrapMilli > 0
                        ? `${withUnit(line.scrapMilli, line.unit)} thành Phế liệu: ${formatQuantity(toQuantity(scrapKgMilli(line.scrapMilli, line.standardWeightKg), "KG"))} kg → ${formatMoney(repair.scrapValue)}.`
                        : "Không có phế liệu."}
                    </p>
                  </article>
                ) : null,
              )}
              <p className="text-caption text-muted-foreground">
                Cách tính như phiếu sửa đơn giản (0.2 #23): chi phí chỉ chia cho
                hàng sửa xong. Khác ở chỗ chi phí tính ra từ công khoán và vật
                tư xuất kho, không nhập tay.
              </p>
            </section>
          ) : null}
        </div>
        <aside className="flex flex-col gap-4">
          <section
            aria-label="Chi phí sửa"
            className="flex flex-col gap-2 rounded-lg bg-primary p-5 text-primary-foreground shadow-md"
          >
            <h2 className="text-sm font-semibold">Chi phí sửa</h2>
            <p data-mask className="font-display text-h1 tabular-nums">
              {numbers ? formatMoney(cost) : "–"}
            </p>
            <p className="text-sm">
              {numbers
                ? `${units("goodMilli")} về Tốt · ${units("scrapMilli")} thành phế liệu`
                : units("takenMilli")}
            </p>
          </section>
          {detail.status !== "POSTED" && detail.status !== "CANCELLED" ? (
            <section
              aria-labelledby="work-posting"
              className="flex flex-col gap-2 rounded-lg border bg-card p-5 text-sm"
            >
              <h2 id="work-posting" className="font-semibold">
                Khi ghi sổ
              </h2>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                <li>
                  Xuất {units("takenMilli")} Chờ sửa ở {detail.workshop.code}
                  {detail.from.id !== detail.workshop.id
                    ? ` (đã chuyển từ ${detail.from.code} lúc xưởng nhận lệnh)`
                    : ""}
                  .
                </li>
                <li>
                  Nhập {numbers ? units("goodMilli") : "…"} Tốt,{" "}
                  {numbers ? units("scrapMilli") : "…"} Phế liệu ở{" "}
                  {detail.from.code}.
                </li>
                {supplyTotals.size > 0 ? (
                  <li>
                    Xuất vật tư:{" "}
                    {[...supplyTotals.values()]
                      .map(
                        (entry) =>
                          `${withUnit(entry.milli, entry.unit)} ${entry.name}`,
                      )
                      .join(", ")}{" "}
                    theo giá BQ.
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}
          {actions}
          <section
            aria-labelledby="work-supplies"
            className="flex flex-col gap-2 rounded-lg border bg-card p-5 text-sm"
          >
            <h2 id="work-supplies" className="font-semibold">
              Vật tư ở {detail.workshop.code}
            </h2>
            {detail.supplies.length === 0 ? (
              <p className="text-muted-foreground">
                Chưa có vật tư phụ ở xưởng.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.supplies.map((supply) => (
                  <li
                    key={supply.itemId}
                    className="flex justify-between gap-3"
                  >
                    <span>
                      <span className="font-semibold">{supply.name}</span>
                      <span className="block text-caption text-muted-foreground">
                        {supply.code}{" "}
                        {withUnit(
                          supply.newMilli + supply.goodMilli,
                          supply.unit,
                        )}
                      </span>
                    </span>
                    <span data-mask className="tabular-nums">
                      {supply.newAvg === null
                        ? "–"
                        : `${formatMoney(supply.newAvg)}/${QUANTITY_UNIT_LABELS[supply.unit]}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-caption text-muted-foreground">
              Tồn trước khi ghi sổ lệnh này. Vật tư nhập kho bằng đơn mua như
              hàng khác.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
