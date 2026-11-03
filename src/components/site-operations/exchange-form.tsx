"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FormError } from "@/components/catalog/form-error";
import { DateInput } from "@/components/domain/date-input";
import { amountText, moneyText } from "@/components/deliveries/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseMoney } from "@/domain/money";
import { dailyChange } from "@/domain/rental";
import { callApi } from "@/lib/api-client";
import type { ExchangeForm as FormData } from "@/lib/exchanges/queries";

import { readCount } from "./transfer-model";

/** "100 × 300 ₫ → 100 × 280 ₫". */
function swapText(
  out: readonly { milli: number; price: number }[],
  back: readonly { milli: number; price: number }[],
): string {
  const side = (rows: readonly { milli: number; price: number }[]) =>
    rows
      .map((row) => `${row.milli / 1000} × ${moneyText(row.price)}`)
      .join(" + ");
  return `${side(back)} → ${side(out)}`;
}

/** D6d (spec site-exchanges "Lập đổi hàng tạo đợt xuất và chờ thu hồi"). */
export function ExchangeForm({ data }: { data: FormData }) {
  const router = useRouter();
  const [yardId, setYardId] = useState(data.yards[0]?.id ?? "");
  const [give, setGive] = useState<Record<string, string>>({});
  const [take, setTake] = useState<Record<string, string>>({});
  const [plannedDate, setPlannedDate] = useState("");
  const [plate, setPlate] = useState("");
  const [freight, setFreight] = useState(
    data.freightPerTrip === null ? "" : String(data.freightPerTrip),
  );
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const out = useMemo(
    () =>
      data.give.flatMap((item) => {
        const milli = readCount(give[item.itemId] ?? "", item) ?? 0;
        return milli > 0 ? [{ item, milli, price: item.dailyPrice }] : [];
      }),
    [data.give, give],
  );
  const back = useMemo(
    () =>
      data.take.flatMap((item) => {
        const milli = readCount(take[item.itemId] ?? "", item) ?? 0;
        return milli > 0 ? [{ item, milli, price: item.dailyPrice }] : [];
      }),
    [data.take, take],
  );
  const change = dailyChange(
    out.map((row) => ({ dailyPrice: row.price, quantityMilli: row.milli })),
    back.map((row) => ({ dailyPrice: row.price, quantityMilli: row.milli })),
  );

  async function submit() {
    setBusy(true);
    setError(null);
    let freightAmount: number | null = null;
    if (data.companyTruck && freight.trim() !== "") {
      try {
        freightAmount = parseMoney(freight);
      } catch {
        freightAmount = null;
      }
    }
    const result = await callApi<{ deliveryCode: string }>("/api/exchanges", {
      method: "POST",
      body: {
        contractId: data.contract.id,
        sourceLocationId: yardId || null,
        plannedDate: plannedDate || null,
        companyTruck: data.companyTruck,
        freightAmount,
        vehiclePlate: plate.trim() || null,
        overContractConfirmed: over,
        lines: out.map((row) => ({
          itemId: row.item.itemId,
          quantity: give[row.item.itemId] ?? "",
        })),
        expected: back.map((row) => ({
          itemId: row.item.itemId,
          quantity: take[row.item.itemId] ?? "",
        })),
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/sales/contracts/${data.contract.id}/deliveries`);
    router.refresh();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <section
          aria-labelledby="exchange-give"
          className="flex flex-col gap-3 rounded-lg border bg-card p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="exchange-give" className="text-h2">
              Giao ra công trình
            </h2>
            <label className="flex items-center gap-2 text-sm">
              từ
              <select
                aria-label="Bãi xuất"
                value={yardId}
                onChange={(event) => setYardId(event.target.value)}
                className="h-9 rounded-md border border-input bg-card px-2"
              >
                {data.yards.map((yard) => (
                  <option key={yard.id} value={yard.id}>
                    {yard.code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hàng</TableHead>
                <TableHead className="text-right">
                  Tồn Mới + Tốt ở bãi
                </TableHead>
                <TableHead className="text-right">Số giao</TableHead>
                <TableHead className="text-right">Giá thuê / ngày</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.give.map((item) => (
                <TableRow key={item.itemId}>
                  <TableCell>
                    <span className="font-medium">{item.name}</span>{" "}
                    <span className="text-caption text-muted-foreground">
                      {item.code}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {amountText(item.yardStock[yardId] ?? 0, item.unit)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      aria-label={`Số giao ${item.code}`}
                      inputMode="numeric"
                      value={give[item.itemId] ?? ""}
                      onChange={(event) =>
                        setGive((prev) => ({
                          ...prev,
                          [item.itemId]: event.target.value,
                        }))
                      }
                      className="ml-auto w-24 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {moneyText(item.dailyPrice)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section
          aria-labelledby="exchange-take"
          className="flex flex-col gap-3 rounded-lg border bg-card p-5"
        >
          <h2 id="exchange-take" className="text-h2">
            Nhận về bãi
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hàng</TableHead>
                <TableHead className="text-right">Đang ở công trình</TableHead>
                <TableHead className="text-right">Số dự kiến nhận</TableHead>
                <TableHead className="text-right">Giá thuê / ngày</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.take.map((item) => (
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
                      aria-label={`Số nhận ${item.code}`}
                      inputMode="numeric"
                      value={take[item.itemId] ?? ""}
                      onChange={(event) =>
                        setTake((prev) => ({
                          ...prev,
                          [item.itemId]: event.target.value,
                        }))
                      }
                      className="ml-auto w-24 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {moneyText(item.dailyPrice)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm text-muted-foreground">
            Số nhận chỉ là dự kiến. Thủ kho đếm thật và chia Tốt / Chờ sửa / Phế
            liệu / Mất trên M4 khi xe hạ tải; hỏng, mất thì tự sinh phiếu đền bù
            như thu hồi thường.
          </p>
        </section>

        <section
          aria-labelledby="exchange-trip"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="exchange-trip" className="text-h2">
            Chuyến xe
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exchange-date">Ngày dự kiến</Label>
              <DateInput
                id="exchange-date"
                value={plannedDate}
                onValueChange={setPlannedDate}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exchange-plate">Biển số xe</Label>
              <Input
                id="exchange-plate"
                value={plate}
                maxLength={20}
                onChange={(event) => setPlate(event.target.value)}
              />
            </div>
            {data.companyTruck ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exchange-freight">Cước một chiều</Label>
                <Input
                  id="exchange-freight"
                  inputMode="numeric"
                  value={freight}
                  onChange={(event) => setFreight(event.target.value)}
                />
                <span className="text-caption text-muted-foreground">
                  Lấy từ hợp đồng, sửa được
                </span>
              </div>
            ) : null}
          </div>
          <span className="flex items-center gap-2">
            <Checkbox
              id="exchange-over"
              checked={over}
              onCheckedChange={(checked) => setOver(checked === true)}
            />
            <Label htmlFor="exchange-over">
              Giao nhiều hơn số còn phải giao thì vẫn giao
            </Label>
          </span>
          <FormError message={error} />
          <div className="flex justify-end">
            <Button disabled={busy} onClick={() => void submit()}>
              Tạo đợt xuất + chờ thu hồi
            </Button>
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <section
          aria-labelledby="exchange-rent"
          className="flex flex-col gap-2 rounded-lg border bg-card p-5"
        >
          <h2 id="exchange-rent" className="text-label text-muted-foreground">
            Tiền thuê 1 ngày sau khi đổi
          </h2>
          <p className="text-h1 tabular-nums">
            {change > 0 ? "+" : change < 0 ? "−" : ""}
            {moneyText(Math.abs(change))}
          </p>
          {out.length > 0 && back.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {swapText(
                out.map((row) => ({ milli: row.milli, price: row.price })),
                back.map((row) => ({ milli: row.milli, price: row.price })),
              )}
            </p>
          ) : null}
        </section>
        <section
          aria-labelledby="exchange-docs"
          className="flex flex-col gap-2 rounded-lg border bg-card p-5"
        >
          <h2 id="exchange-docs" className="text-h3">
            Chứng từ sẽ tạo
          </h2>
          <p className="text-sm">
            <span className="font-medium">
              Đợt {data.nextBatchNo} · Phiếu xuất
            </span>
            <br />
            Thủ kho nhặt trên M5, bấm &ldquo;Xác nhận xe rời bãi&rdquo;. Tính
            thuê từ hôm sau.
          </p>
          <p className="text-sm">
            <span className="font-medium">
              Chờ thu hồi · Phiếu thu hồi (khi xe về)
            </span>
            <br />
            Thủ kho đếm trên M4. Tính thuê đến hết ngày xe về.
          </p>
          <p className="text-caption text-muted-foreground">
            Hai phiếu ghi &ldquo;Đổi hàng&rdquo; và trỏ tới nhau trên D6. Mã
            giao ra phải có trên hợp đồng đang áp dụng.
          </p>
        </section>
      </aside>
    </div>
  );
}
