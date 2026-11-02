import { formatBusinessDate } from "@/domain/business-date";
import { CONDITION_LABELS, type Condition } from "@/domain/condition";
import { formatVatRate } from "@/domain/contract-lines";
import { formatMoney, toMoney } from "@/domain/money";
import {
  formatQuantity,
  QUANTITY_UNIT_LABELS,
  quantityFromDb,
  type QuantityUnit,
} from "@/domain/quantity";
import type { ContractType } from "@/domain/contract";
import type { RevisionView } from "@/lib/contracts/queries";

const money = (value: number | null) =>
  value === null ? "–" : formatMoney(toMoney(value));

function quantity(text: string, unit: string): string {
  const shown = unit as QuantityUnit;
  return `${formatQuantity(quantityFromDb(text, shown))} ${QUANTITY_UNIT_LABELS[shown] ?? ""}`;
}

const head = "border-b px-3 py-2 font-semibold";
const cell = "border-b px-3 py-2";

/** Lines of D5: kits with their parts, then items added alone. */
export function LinesTable({
  type,
  view,
}: {
  type: ContractType;
  view: RevisionView;
}) {
  if (type === "SALE") {
    return (
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th scope="col" className={head}>
                Hàng
              </th>
              <th scope="col" className={head}>
                Tình trạng
              </th>
              <th scope="col" className={`${head} text-right`}>
                Số lượng
              </th>
              <th scope="col" className={`${head} text-right`}>
                Đơn giá
              </th>
            </tr>
          </thead>
          <tbody>
            {view.lines.map((line) => (
              <tr key={`${line.itemId}-${line.condition}-${line.pricingUnit}`}>
                <th scope="row" className={`${cell} text-left font-normal`}>
                  {line.name}{" "}
                  <span className="text-muted-foreground">· {line.code}</span>
                </th>
                <td className={cell}>
                  {CONDITION_LABELS[(line.condition ?? "GOOD") as Condition]}
                </td>
                <td className={`${cell} text-right tabular-nums`}>
                  {quantity(
                    line.quantity,
                    line.pricingUnit === "ITEM" ? line.unit : "KG",
                  )}
                </td>
                <td className={`${cell} text-right tabular-nums`}>
                  {money(line.price)}
                  {line.pricingUnit === "ITEM" ? "" : "/kg"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted">
              <th
                scope="row"
                colSpan={3}
                className="px-3 py-2 text-left font-semibold"
              >
                Tổng tiền hàng
              </th>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                {money(view.value)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className={head}>
              Hàng
            </th>
            <th scope="col" className={`${head} text-right`}>
              Số lượng
            </th>
            <th scope="col" className={`${head} text-right`}>
              Giá / ngày
            </th>
            <th scope="col" className={`${head} text-right`}>
              Tiền 1 ngày
            </th>
          </tr>
        </thead>
        <tbody>
          {view.kits.map((entry) => (
            <tr key={entry.kitId} className="bg-muted">
              <th scope="row" colSpan={4} className={`${cell} text-left`}>
                {entry.name} × {entry.quantity} bộ
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · tự tách thành linh kiện
                </span>
              </th>
            </tr>
          ))}
          {view.lines.map((line) => {
            const milli = quantityFromDb(line.quantity, "KG").milli;
            return (
              <tr key={line.itemId}>
                <th scope="row" className={`${cell} text-left font-normal`}>
                  {line.name}{" "}
                  <span className="text-muted-foreground">· {line.code}</span>
                </th>
                <td className={`${cell} text-right tabular-nums`}>
                  {quantity(line.quantity, line.unit)}
                </td>
                <td className={`${cell} text-right tabular-nums`}>
                  {money(line.price)}
                  {line.catalogPrice !== null &&
                  line.price !== null &&
                  line.price !== line.catalogPrice ? (
                    <span className="block text-caption text-warning">
                      Danh mục: {money(line.catalogPrice)}
                    </span>
                  ) : null}
                </td>
                <td className={`${cell} text-right tabular-nums`}>
                  {line.price === null
                    ? "–"
                    : money(Math.round((line.price * milli) / 1000))}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted">
            <th
              scope="row"
              colSpan={3}
              className="px-3 py-2 text-left font-semibold"
            >
              Tiền thuê 1 ngày
              <span className="ml-2 font-normal text-muted-foreground">
                ·{" "}
                {view.months
                  .map(
                    (month) =>
                      `tháng ${month.days} ngày ≈ ${money(month.amount)}`,
                  )
                  .join(", ")}
              </span>
            </th>
            <td className="px-3 py-2 text-right font-semibold tabular-nums">
              {money(view.dayRent)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function CompensationList({ view }: { view: RevisionView }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className={head}>
              Hàng
            </th>
            <th scope="col" className={`${head} text-right`}>
              Mất
            </th>
            <th scope="col" className={`${head} text-right`}>
              Hỏng, sửa được
            </th>
          </tr>
        </thead>
        <tbody>
          {view.compensations.map((entry) => {
            const unit = QUANTITY_UNIT_LABELS[entry.unit as QuantityUnit] ?? "";
            const mark = (value: number | null, table: number | null) =>
              table !== null && value !== null && value !== table ? (
                <span className="block text-caption text-warning">
                  Bảng chung: {money(table)}
                </span>
              ) : null;
            return (
              <tr key={entry.itemId}>
                <th scope="row" className={`${cell} text-left font-normal`}>
                  {entry.name}{" "}
                  <span className="text-muted-foreground">· / {unit}</span>
                </th>
                <td className={`${cell} text-right tabular-nums`}>
                  {money(entry.lostPrice)}
                  {mark(entry.lostPrice, entry.catalogLostPrice)}
                </td>
                <td className={`${cell} text-right tabular-nums`}>
                  {money(entry.damagePrice)}
                  {mark(entry.damagePrice, entry.catalogDamagePrice)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-caption text-muted-foreground">
        Hàng hỏng đến mức thành phế liệu tính như mất.
      </p>
    </div>
  );
}

export function DepositList({ view }: { view: RevisionView }) {
  const cash = view.deposits.filter((entry) => entry.kind === "CASH");
  const guarantees = view.deposits.filter(
    (entry) => entry.kind === "GUARANTEE",
  );
  if (view.deposits.length === 0) {
    return <p className="text-sm text-muted-foreground">Không có cọc.</p>;
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      {cash.map((entry, index) => (
        <p key={`cash-${index}`}>
          Cọc tiền{" "}
          <strong className="tabular-nums">{money(entry.amount)}</strong> ·{" "}
          {entry.method === "CASH" ? "tiền mặt" : "chuyển khoản"}
        </p>
      ))}
      {guarantees.map((entry, index) => (
        <p key={`guarantee-${index}`}>
          Bảo lãnh {entry.bankName} số {entry.guaranteeNumber} ·{" "}
          <strong className="tabular-nums">{money(entry.amount)}</strong> · hết
          hạn {entry.expiryDate ? formatBusinessDate(entry.expiryDate) : "–"}
        </p>
      ))}
      <p className="text-muted-foreground">
        Tổng cọc tiền{" "}
        {money(cash.reduce((sum, entry) => sum + entry.amount, 0))} · tổng bảo
        lãnh {money(guarantees.reduce((sum, entry) => sum + entry.amount, 0))}.
        Cọc giữ riêng theo hợp đồng, chỉ cấn trừ khi thanh lý công trình; cọc
        thừa trả lại khách.
      </p>
    </div>
  );
}

export function BatchList({ view }: { view: RevisionView }) {
  if (view.batches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Chưa có kế hoạch giao.</p>
    );
  }
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {view.batches.map((batch, index) => (
        <li key={`${batch.plannedDate}-${index}`} className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
            {index + 1}
          </span>
          <span>
            <strong>{formatBusinessDate(batch.plannedDate)}</strong> ·{" "}
            {batch.lines
              .map(
                (line) =>
                  `${formatQuantity(quantityFromDb(line.quantity, "KG"))} ${line.kitId ? `× ${line.name}` : line.name}`,
              )
              .join(" + ")}
            {batch.note ? (
              <span className="text-muted-foreground"> · {batch.note}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** "Hàng tháng · trả trong 30 ngày", VAT and transport of D5. */
export function TermsSummary({
  type,
  view,
}: {
  type: ContractType;
  view: RevisionView;
}) {
  const t = view.terms;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground">Thời gian</dt>
        <dd>
          {type === "RENTAL"
            ? `${formatBusinessDate(t.startDate)} – ${t.endDate ? formatBusinessDate(t.endDate) : "chưa có"}${view.expectedDays ? ` · ${view.expectedDays.days} ngày` : ""}`
            : `Giao ${formatBusinessDate(t.startDate)}`}
        </dd>
      </div>
      {type === "RENTAL" ? (
        <div>
          <dt className="text-muted-foreground">Tính tiền</dt>
          <dd>
            Hàng tháng · trả trong {t.paymentTermsDays} ngày · thuê tối thiểu{" "}
            {t.minRentalDays} ngày
          </dd>
        </div>
      ) : (
        <div>
          <dt className="text-muted-foreground">Hạn thanh toán</dt>
          <dd>Trả trong {t.paymentTermsDays} ngày</dd>
        </div>
      )}
      <div>
        <dt className="text-muted-foreground">VAT</dt>
        <dd>
          {t.vatEnabled && t.vatRate
            ? `VAT ${formatVatRate(t.vatRate)} · cộng vào công nợ khi chốt kỳ`
            : "Không lấy hóa đơn VAT"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Vận chuyển</dt>
        <dd>
          {t.companyTruck
            ? `Công ty gọi xe, cước chiều đi ${money(t.freightPerTrip)}/chuyến, tính vào công nợ nhà thầu`
            : "Khách tự chở"}
        </dd>
      </div>
      {t.signedDate ? (
        <div>
          <dt className="text-muted-foreground">Ngày ký</dt>
          <dd>{formatBusinessDate(t.signedDate)}</dd>
        </div>
      ) : null}
      {t.note ? (
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Ghi chú</dt>
          <dd>{t.note}</dd>
        </div>
      ) : null}
    </dl>
  );
}
