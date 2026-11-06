// "Hàng ở ngoài theo khu vực" of D1 (0.2 #97, design D8): pieces count cái
// items only, tons every item.
import Link from "next/link";

import { piecesText, tonsText } from "@/domain/dashboard";
import type { OnSiteSummary } from "@/lib/dashboard/stock";

import { Panel } from "./panel";

const cell = "px-3.5 py-2.5 text-right whitespace-nowrap";

export function RegionTable({ onSite }: { onSite: OnSiteSummary }) {
  return (
    <Panel
      id="regions"
      title="Hàng ở ngoài theo khu vực"
      actions={
        <Link
          href="/inventory"
          className="text-label text-primary hover:underline"
        >
          Xem tồn kho
        </Link>
      }
      note="Số cái chỉ cộng mã tính theo cái. Tấn = số lượng × khối lượng chuẩn của mọi mã. Khu vực theo tỉnh của công trình."
    >
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-label font-normal tabular-nums">
          <thead className="bg-background">
            <tr className="border-b">
              <th scope="col" className="px-3.5 py-2.5 text-left font-semibold">
                Khu vực
              </th>
              <th scope="col" className={`${cell} font-semibold`}>
                Công trình
              </th>
              <th scope="col" className={`${cell} font-semibold`}>
                Số cái
              </th>
              <th scope="col" className={`${cell} font-semibold`}>
                Tấn
              </th>
            </tr>
          </thead>
          <tbody data-mask>
            {onSite.regions.map((row) => (
              <tr key={row.label} className="border-b">
                <th scope="row" className="px-3.5 py-2.5 text-left font-medium">
                  {row.label}
                </th>
                <td className={cell}>{row.siteCount}</td>
                <td className={cell}>{piecesText(row.piecesMilli)}</td>
                <td className={cell}>{tonsText(row.kgMilli)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-background font-bold" data-mask>
            <tr>
              <th scope="row" className="px-3.5 py-2.5 text-left">
                Cộng
              </th>
              <td className={cell}>{onSite.total.siteCount}</td>
              <td className={cell}>{piecesText(onSite.total.piecesMilli)}</td>
              <td className={cell}>{tonsText(onSite.total.kgMilli)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}
