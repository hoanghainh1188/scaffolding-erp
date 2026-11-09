import type { Metadata } from "next";
import Link from "next/link";

import { ScrapItemForm } from "@/components/production/scrap-item-form";
import { ScrapPriceForm } from "@/components/settings/scrap-price-form";
import { getDatabase } from "@/db/client";
import {
  formatBusinessDate,
  formatDateTime,
  toBusinessDate,
} from "@/domain/business-date";
import { formatMoney } from "@/domain/money";
import { SCRAP_PRICE_MESSAGES } from "@/domain/scrap-price";
import { requirePermission } from "@/lib/auth/guard";
import { scrapItemChoices } from "@/lib/production/queries";
import { currentScrapItem } from "@/lib/production/settings";
import {
  currentScrapPrice,
  scrapPriceHistory,
} from "@/lib/receiving/scrap-price";

export const metadata: Metadata = { title: "Giá sắt vụn tham khảo" };

/** Spec scrap-price "Màn giá sắt vụn tham khảo"; director only. */
export default async function Page() {
  await requirePermission("scrap-price.manage");
  const db = getDatabase();
  const [current, history, scrapItem, choices] = await Promise.all([
    currentScrapPrice(db),
    scrapPriceHistory(db),
    currentScrapItem(db),
    scrapItemChoices(db),
  ]);
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/settings" className="hover:underline">
          Cài đặt
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Giá sắt vụn tham khảo</span>
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Giá sắt vụn tham khảo</h1>
        <p className="text-body text-muted-foreground">
          Dùng để định giá phần Phế liệu khi tách lô hàng cũ lúc nhập kho. Giá
          mới có hiệu lực ngay; phiếu đã nhập giữ giá cũ.
        </p>
      </div>
      <section
        aria-label="Giá hiện hành"
        className="flex flex-col gap-1 rounded-lg border bg-card p-5"
      >
        <h2 className="text-label text-muted-foreground">Giá hiện hành</h2>
        {current ? (
          <>
            <p className="font-display text-h1 tabular-nums">
              {formatMoney(current.pricePerKg)}/kg
            </p>
            <p data-mask className="text-body text-muted-foreground">
              {current.createdByName} ·{" "}
              {formatBusinessDate(toBusinessDate(current.createdAt))}
            </p>
          </>
        ) : (
          <p className="text-body">{SCRAP_PRICE_MESSAGES.none}</p>
        )}
      </section>
      <ScrapPriceForm />
      <ScrapItemForm current={scrapItem} choices={choices} />
      {history.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
          <h2 className="font-display text-h2">Các lần đổi giá</h2>
          <table className="w-full table-fixed border-collapse text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th scope="col" className="w-40 px-3 py-2">
                  Thời điểm
                </th>
                <th scope="col" className="w-32 px-3 py-2 text-right">
                  Giá
                </th>
                <th scope="col" className="w-40 px-3 py-2">
                  Người đổi
                </th>
                <th scope="col" className="px-3 py-2">
                  Ghi chú
                </th>
              </tr>
            </thead>
            <tbody data-mask>
              {history.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="px-3 py-2 tabular-nums">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.pricePerKg)}/kg
                  </td>
                  <td className="px-3 py-2">{row.createdByName}</td>
                  <td className="px-3 py-2">{row.note ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
