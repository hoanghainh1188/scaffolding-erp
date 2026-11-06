// "Hao hụt hàng cho thuê" and "Tỷ lệ khai thác" of D15 (spec
// management-reports "Bảng hao hụt theo mã", "Bảng tỷ lệ khai thác theo mã";
// spec fleet-metrics; 0.2 số 108, số 109, số 114): ten items, then "N mã khác".
import { Panel } from "@/components/dashboard/panel";
import { tonsText } from "@/domain/dashboard";
import {
  averageKgMilli,
  averagePieces,
  groupOthers,
  hundredthsText,
  lossPer100,
  otherLosses,
  otherUses,
  REPORT_ROW_LIMIT,
  utilizationTenths,
  type LossRow,
  type UseRow,
} from "@/domain/fleet-metrics";
import { percentText } from "@/domain/gross-profit";
import type { Report } from "@/lib/reports/report";
import { cn } from "@/lib/utils";

const NUMBER = "px-3 py-2.5 text-right whitespace-nowrap tabular-nums";
const HEAD = "px-3 py-2.5 text-right font-semibold";

function ItemCell({
  row,
}: {
  row: { itemId: string | null; code: string; name: string };
}) {
  return (
    <th scope="row" className="px-3 py-2.5 text-left font-normal">
      {row.itemId ? (
        <>
          <span className="block">{row.name}</span>
          <span className="text-caption text-muted-foreground">{row.code}</span>
        </>
      ) : (
        <span className="text-muted-foreground">{row.name}</span>
      )}
    </th>
  );
}

function LossLine({ row, total }: { row: LossRow; total?: boolean }) {
  const ratio = lossPer100(row);
  return (
    <tr className={cn("border-b", total && "bg-accent font-bold")}>
      <ItemCell row={row} />
      <td className={NUMBER}>{tonsText(averageKgMilli(row))}</td>
      <td className={NUMBER}>{hundredths(row.lossKgMilli)}</td>
      <td className={NUMBER}>{hundredths(row.scrapKgMilli)}</td>
      <td className={NUMBER}>{hundredths(row.repairKgMilli)}</td>
      <td className={cn(NUMBER, "font-semibold")}>{hundredthsText(ratio)}</td>
    </tr>
  );
}

/** Tonnes with two decimals: "0,31". */
const hundredths = (kgMilli: number) =>
  hundredthsText(Math.round(kgMilli / 10_000));

export function LossTable({ report }: { report: Report }) {
  const { shown, others } = groupOthers(
    report.losses.rows,
    REPORT_ROW_LIMIT,
    otherLosses,
  );
  const year = lossPer100(report.lossesYear);
  return (
    <Panel
      id="loss"
      title="Hao hụt hàng cho thuê"
      note={`Tấn hàng mất, thành phế, phải sửa khi thu hồi trên mỗi 100 tấn hàng cho thuê (Mới, Tốt ở bãi, xưởng và công trình) bình quân trong kỳ. Năm ${report.year}: ${hundredthsText(year)} tấn / 100 tấn.${
        report.fleet.weightless > 0
          ? ` ${report.fleet.weightless} mã chưa có trọng lượng chuẩn, chưa tính vào tấn.`
          : ""
      }`}
    >
      {report.losses.rows.length === 0 ? (
        <p className="text-body text-muted-foreground">
          Không có hàng cho thuê trong kỳ.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-label font-normal">
            <thead>
              <tr className="border-b text-caption text-muted-foreground">
                <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                  Mã hàng
                </th>
                <th scope="col" className={HEAD}>
                  Bình quân (tấn)
                </th>
                <th scope="col" className={HEAD}>
                  Mất
                </th>
                <th scope="col" className={HEAD}>
                  Phế
                </th>
                <th scope="col" className={HEAD}>
                  Phải sửa
                </th>
                <th scope="col" className={HEAD}>
                  / 100 tấn
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <LossLine key={row.itemId} row={row} />
              ))}
              {others ? <LossLine row={others} /> : null}
            </tbody>
            <tfoot>
              <LossLine row={report.losses.total} total />
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}

function UseLine({ row }: { row: UseRow }) {
  const rate = utilizationTenths(row.siteMilliDays, row.totalMilliDays);
  return (
    <tr className="border-b">
      <ItemCell row={row} />
      <td className={NUMBER}>
        {averagePieces(row.totalMilliDays, row.days).toLocaleString("vi-VN")}
      </td>
      <td className={NUMBER}>
        {averagePieces(row.siteMilliDays, row.days).toLocaleString("vi-VN")}
      </td>
      <td className={cn(NUMBER, "font-semibold")}>
        {rate === null ? "—" : percentText(rate)}
      </td>
    </tr>
  );
}

export function UseTable({ report }: { report: Report }) {
  const { shown, others } = groupOthers(
    report.uses,
    REPORT_ROW_LIMIT,
    otherUses,
  );
  return (
    <Panel
      id="util"
      title="Tỷ lệ khai thác"
      note="Bình quân theo ngày trong kỳ, chỉ hàng Mới và Tốt. Tổng cả kho tính theo tấn để cộng được mọi mã; bảng theo mã tính theo cái. Xếp từ cao xuống thấp."
    >
      {report.uses.length === 0 ? (
        <p className="text-body text-muted-foreground">
          Không có hàng tính theo cái trong kỳ.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse text-label font-normal">
            <thead>
              <tr className="border-b text-caption text-muted-foreground">
                <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                  Mã hàng
                </th>
                <th scope="col" className={HEAD}>
                  Tổng (cái)
                </th>
                <th scope="col" className={HEAD}>
                  Ở công trình
                </th>
                <th scope="col" className={HEAD}>
                  Khai thác
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <UseLine key={row.itemId} row={row} />
              ))}
              {others ? <UseLine row={others} /> : null}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
