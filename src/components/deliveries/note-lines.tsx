// Lines of a delivery note on the office detail and the print page.
import { byWeight } from "@/domain/contract-lines";
import { CONDITION_LABELS } from "@/domain/condition";
import { hasStandardWeight } from "@/domain/quantity";
import type { DeliveryDetail } from "@/lib/deliveries/queries";

import { amountText, moneyText } from "./format";

const head = "border-b px-3 py-2 font-semibold";
const cell = "border-b px-3 py-2 align-top";

type Line = DeliveryDetail["lines"][number];

function pickedText(line: Line): string {
  if (line.picks.length === 0) return "–";
  return line.picks
    .map((pick) => {
      const pieces = amountText(pick.quantityMilli, line.unit);
      const kg =
        pick.weighedMilli !== null && hasStandardWeight(line.unit)
          ? ` · ${amountText(pick.weighedMilli, "KG")}`
          : "";
      const shown = pick.piecesEstimated
        ? `≈ ${pieces} (ước tính từ ${amountText(pick.weighedMilli ?? 0, "KG")})`
        : `${pieces}${kg}`;
      return line.condition === null
        ? `${CONDITION_LABELS[pick.condition]} ${shown}`
        : shown;
    })
    .join(", ");
}

/**
 * Needed and picked per line; `blankPicks` leaves the picked column empty
 * (the picking list), `prices` adds the sale price and money.
 */
export function NoteLines({
  lines,
  posted,
  prices,
  blankPicks = false,
}: {
  lines: Line[];
  posted: boolean;
  prices: boolean;
  blankPicks?: boolean;
}) {
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className={head}>
              Hàng
            </th>
            <th scope="col" className={`${head} text-right`}>
              Số cần
            </th>
            <th scope="col" className={head}>
              {posted ? "Đã xuất" : "Số nhặt"}
            </th>
            {prices ? (
              <>
                <th scope="col" className={`${head} text-right`}>
                  Đơn giá
                </th>
                <th scope="col" className={`${head} text-right`}>
                  Thành tiền
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <th scope="row" className={`${cell} text-left font-normal`}>
                {line.itemName}{" "}
                <span className="text-muted-foreground">
                  · {line.itemCode}
                  {line.condition
                    ? ` · ${CONDITION_LABELS[line.condition]}`
                    : ""}
                </span>
              </th>
              <td className={`${cell} text-right tabular-nums`}>
                {amountText(line.requestedMilli, line.lineUnit)}
              </td>
              <td className={`${cell} tabular-nums`}>
                {blankPicks ? "" : pickedText(line)}
                {posted && line.pickedMilli < line.requestedMilli ? (
                  <span className="block text-caption text-warning">
                    thiếu{" "}
                    {amountText(
                      line.requestedMilli - line.pickedMilli,
                      line.lineUnit,
                    )}
                  </span>
                ) : null}
              </td>
              {prices ? (
                <>
                  <td className={`${cell} text-right tabular-nums`}>
                    {moneyText(line.unitPrice)}
                    {byWeight(line.pricingUnit ?? "") ? "/kg" : ""}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {moneyText(line.amount)}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
        {prices ? (
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" colSpan={4} className="px-3 py-2 text-right">
                Tổng tiền hàng
              </th>
              <td className="px-3 py-2 text-right tabular-nums">
                {moneyText(total)}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
