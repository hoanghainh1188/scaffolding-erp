"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FormError } from "@/components/catalog/form-error";
import { amountText, moneyText } from "@/components/deliveries/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buyBackLineAmount, buyBackTotal } from "@/domain/buy-back";
import { parseMoney } from "@/domain/money";
import { dailyChange } from "@/domain/rental";
import { callApi } from "@/lib/api-client";
import type { BuyBackForm as FormData } from "@/lib/buy-backs/queries";

import { readCount } from "./transfer-model";

export interface BuyBackDraft {
  id: string;
  code: string;
  updatedAt: string;
  reason: string;
  counts: Record<string, string>;
  prices: Record<string, string>;
}

function readPrice(text: string): number | null {
  if (text.trim() === "") return null;
  try {
    return parseMoney(text);
  } catch {
    return null;
  }
}

/** D6c for sales: lines, prices prefilled from the lost price (0.2 #67). */
export function BuyBackForm({
  data,
  draft,
}: {
  data: FormData;
  draft?: BuyBackDraft;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>(
    draft?.counts ?? {},
  );
  const [prices, setPrices] = useState<Record<string, string>>(
    draft?.prices ??
      Object.fromEntries(
        data.items.map((item) => [
          item.itemId,
          item.lostPrice === null ? "" : String(item.lostPrice),
        ]),
      ),
  );
  const [reason, setReason] = useState(draft?.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lines = useMemo(
    () =>
      data.items.flatMap((item) => {
        const milli = readCount(counts[item.itemId] ?? "", item) ?? 0;
        if (milli === 0) return [];
        return [
          {
            item,
            milli,
            unitPrice: readPrice(prices[item.itemId] ?? ""),
          },
        ];
      }),
    [data.items, counts, prices],
  );
  const total = buyBackTotal(
    lines.map((line) => ({
      milli: line.milli,
      unitPrice: line.unitPrice ?? 0,
    })),
  );
  const drop = dailyChange(
    [],
    lines.map((line) => ({
      dailyPrice: line.item.dailyPrice,
      quantityMilli: line.milli,
    })),
  );

  async function submit() {
    setBusy(true);
    setError(null);
    const body = {
      contractId: data.contract.id,
      reason,
      lines: lines.map((line) => ({
        itemId: line.item.itemId,
        quantity: counts[line.item.itemId] ?? "",
        unitPrice: line.unitPrice,
      })),
      ...(draft ? { updatedAt: draft.updatedAt } : {}),
    };
    const result = draft
      ? await callApi<{ code: string }>(`/api/buy-backs/${draft.id}`, {
          method: "PUT",
          body,
        })
      : await callApi<{ code: string }>("/api/buy-backs", {
          method: "POST",
          body,
        });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/sales/buy-backs/${result.data.code}`);
    router.refresh();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <section
          aria-labelledby="buy-back-lines"
          className="flex flex-col gap-3 rounded-lg border bg-card p-5"
        >
          <h2 id="buy-back-lines" className="text-h2">
            Hàng khách mua
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hàng</TableHead>
                <TableHead className="text-right">Đang ở công trình</TableHead>
                <TableHead className="text-right">Số mua</TableHead>
                <TableHead className="text-right">Đơn giá</TableHead>
                <TableHead className="text-right">Thành tiền</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                const line = lines.find(
                  (row) => row.item.itemId === item.itemId,
                );
                const price = readPrice(prices[item.itemId] ?? "");
                const off = price !== null && price !== item.lostPrice;
                return (
                  <TableRow key={item.itemId}>
                    <TableCell>
                      <span className="font-medium">{item.name}</span>{" "}
                      <span className="text-caption text-muted-foreground">
                        {item.code}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {amountText(item.onSiteMilli, item.unit)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        aria-label={`Số mua ${item.code}`}
                        inputMode="numeric"
                        value={counts[item.itemId] ?? ""}
                        onChange={(event) =>
                          setCounts((prev) => ({
                            ...prev,
                            [item.itemId]: event.target.value,
                          }))
                        }
                        className="ml-auto w-24 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        aria-label={`Đơn giá ${item.code}`}
                        inputMode="numeric"
                        placeholder="Chưa có giá"
                        value={prices[item.itemId] ?? ""}
                        onChange={(event) =>
                          setPrices((prev) => ({
                            ...prev,
                            [item.itemId]: event.target.value,
                          }))
                        }
                        className="ml-auto w-32 text-right"
                      />
                      <span className="text-caption text-muted-foreground">
                        {item.lostPrice === null
                          ? "hợp đồng chưa có giá mất"
                          : off
                            ? `khác giá hợp đồng (${moneyText(item.lostPrice)})`
                            : "giá mất trên hợp đồng"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line
                        ? moneyText(
                            buyBackLineAmount({
                              milli: line.milli,
                              unitPrice: price ?? 0,
                            }),
                          )
                        : "–"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Cộng</TableCell>
                <TableCell className="text-right tabular-nums">
                  {moneyText(total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className="text-sm text-muted-foreground">
            Đơn giá điền sẵn bằng giá mất trên bản hợp đồng đang áp dụng; Kinh
            doanh sửa được, giá khác hợp đồng được đánh dấu. Không mua lại quá
            số đang ở công trình.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="buy-back-reason">Lý do</Label>
            <textarea
              id="buy-back-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-base"
            />
          </div>
          <FormError message={error} />
          <div className="flex justify-end">
            <Button disabled={busy} onClick={() => void submit()}>
              {draft ? "Lưu" : "Gửi Giám đốc duyệt"}
            </Button>
          </div>
        </section>
      </div>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <section
          aria-labelledby="buy-back-total"
          className="flex flex-col gap-2 rounded-lg border bg-card p-5"
        >
          <h2 id="buy-back-total" className="text-label text-muted-foreground">
            Tiền bán
          </h2>
          <p className="text-h1 tabular-nums">{moneyText(total)}</p>
          <p className="text-sm text-muted-foreground">
            Cộng vào công nợ khi duyệt · hạn {data.paymentTermsDays} ngày theo
            hợp đồng
          </p>
          <p className="text-sm">
            Tiền thuê 1 ngày ở {data.contract.siteName} giảm {moneyText(-drop)}{" "}
            từ hôm sau ngày duyệt.
          </p>
        </section>
      </aside>
    </div>
  );
}
