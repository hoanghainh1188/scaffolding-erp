"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FormError } from "@/components/catalog/form-error";
import { amountText, moneyText } from "@/components/deliveries/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addDays, formatBusinessDate } from "@/domain/business-date";
import type { BusinessDate } from "@/domain/business-date";
import { formatQuantity, toQuantity } from "@/domain/quantity";
import type { ConfirmMode } from "@/domain/site-transfer";
import { callApi } from "@/lib/api-client";
import type { TransferForm as FormData } from "@/lib/site-transfers/queries";
import { cn } from "@/lib/utils";

import { minimumText, previewTransfer, remainingText } from "./transfer-model";
import { NumericInput } from "@/components/domain/numeric-input";

export interface TransferDraft {
  id: string;
  code: string;
  updatedAt: string;
  toContractId: string;
  counts: Record<string, string>;
  vehiclePlate: string;
  note: string;
  mode: ConfirmMode;
  otherCustomerConfirmed: boolean;
  overContractConfirmed: boolean;
}

export interface TransferFormProps {
  data: FormData;
  today: BusinessDate;
  /** A saved draft being edited; absent for a new transfer. */
  draft?: TransferDraft;
}

interface Saved {
  id: string;
  code: string;
  updatedAt: string;
}

/** D6b (spec site-transfers "Phiếu chuyển trên Desktop"). */
export function TransferForm({ data, today, draft }: TransferFormProps) {
  const router = useRouter();
  const [toId, setToId] = useState(draft?.toContractId ?? "");
  const [counts, setCounts] = useState<Record<string, string>>(
    draft?.counts ?? {},
  );
  const [mode, setMode] = useState<ConfirmMode>(draft?.mode ?? "OFFICE");
  const [plate, setPlate] = useState(draft?.vehiclePlate ?? "");
  const [note, setNote] = useState(draft?.note ?? "");
  const [otherCustomer, setOtherCustomer] = useState(
    draft?.otherCustomerConfirmed ?? false,
  );
  const [overContract, setOverContract] = useState(
    draft?.overContractConfirmed ?? false,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const target = data.targets.find((row) => row.id === toId) ?? null;
  const preview = useMemo(
    () => previewTransfer(data.items, counts, target, data.from.customerId),
    [data.items, counts, target, data.from.customerId],
  );
  const toSite = target?.siteName ?? "công trình nhận";
  const unit = data.items[0]?.unit ?? "PIECE";

  function body(confirm = false) {
    return {
      fromContractId: data.from.id,
      toContractId: toId || undefined,
      lines: data.items
        .filter((item) => (counts[item.itemId] ?? "").trim() !== "")
        .map((item) => ({
          itemId: item.itemId,
          quantity: counts[item.itemId] ?? "",
        })),
      vehiclePlate: plate.trim() || null,
      note: note.trim() || null,
      otherCustomerConfirmed: otherCustomer,
      overContractConfirmed: overContract,
      ...(draft ? { updatedAt: draft.updatedAt } : {}),
      ...(confirm ? { confirm: true } : {}),
    };
  }

  async function save(): Promise<Saved | null> {
    const result = draft
      ? await callApi<Saved>(`/api/site-transfers/${draft.id}`, {
          method: "PUT",
          body: body(),
        })
      : await callApi<Saved>("/api/site-transfers", {
          method: "POST",
          body: body(),
        });
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    return result.data;
  }

  async function run(action: "DRAFT" | "CONFIRM") {
    setBusy(true);
    setError(null);
    let code: string | null = null;
    if (action === "DRAFT") {
      code = (await save())?.code ?? null;
    } else if (mode === "OFFICE" && !draft) {
      const posted = await callApi<{ code: string }>("/api/site-transfers", {
        method: "POST",
        body: body(true),
      });
      if (posted.ok) code = posted.data.code;
      else setError(posted.error);
    } else {
      const saved = await save();
      if (saved) {
        const next = await callApi<{ code: string }>(
          `/api/site-transfers/${saved.id}/${mode === "OFFICE" ? "post" : "send"}`,
          { method: "POST", body: { updatedAt: saved.updatedAt } },
        );
        if (next.ok) code = saved.code;
        else setError(next.error);
      }
    }
    setBusy(false);
    if (code === null) return;
    router.push(`/sales/site-transfers/${code}`);
    router.refresh();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <section
          aria-labelledby="route-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="route-title" className="text-h2">
            Chuyển từ đâu sang đâu
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-label">Công trình đi (hợp đồng này)</span>
              <span className="font-medium">{data.from.siteName}</span>
              <span className="text-sm text-muted-foreground">
                {data.from.code} · {data.from.customerName}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transfer-target">Công trình nhận</Label>
              <select
                id="transfer-target"
                value={toId}
                onChange={(event) => setToId(event.target.value)}
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-base"
              >
                <option value="">Chọn công trình nhận</option>
                {data.targets.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.siteName} · {row.code}
                  </option>
                ))}
              </select>
              <span className="text-caption text-muted-foreground">
                Chỉ hợp đồng thuê Đã duyệt / Đang thực hiện
              </span>
            </div>
          </div>
          {preview.sameCustomer === false ? (
            <span className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2">
              <Checkbox
                id="other-customer"
                checked={otherCustomer}
                onCheckedChange={(checked) =>
                  setOtherCustomer(checked === true)
                }
              />
              <Label htmlFor="other-customer">
                Hàng chuyển sang nhà thầu khác ({data.from.customerName} →{" "}
                {target?.customerName})
              </Label>
            </span>
          ) : target ? (
            <p className="text-sm text-muted-foreground">
              Cùng nhà thầu {target.customerName}. Khác nhà thầu thì phải tích
              xác nhận trước khi chuyển.
            </p>
          ) : null}
        </section>

        <section
          aria-labelledby="goods-title"
          className="flex flex-col gap-3 rounded-lg border bg-card p-5"
        >
          <h2 id="goods-title" className="text-h2">
            Hàng chuyển
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hàng</TableHead>
                <TableHead className="text-right">
                  Đang ở {data.from.siteName}
                </TableHead>
                <TableHead className="text-right">Số chuyển</TableHead>
                <TableHead>Rút từ</TableHead>
                <TableHead className="text-right">Giá ở {toSite}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                const line = preview.lines.find(
                  (row) => row.item.itemId === item.itemId,
                );
                const price = target?.prices[item.itemId];
                return (
                  <TableRow key={item.itemId}>
                    <TableCell>
                      <span className="font-medium">{item.name}</span>{" "}
                      <span className="text-caption text-muted-foreground">
                        {item.code}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.newMilli > 0
                        ? `${formatQuantity(toQuantity(item.newMilli, item.unit))} Mới · `
                        : ""}
                      {formatQuantity(toQuantity(item.goodMilli, item.unit))}{" "}
                      Tốt
                    </TableCell>
                    <TableCell className="text-right">
                      <NumericInput
                        aria-label={`Số chuyển ${item.code}`}
                        kind="count"
                        value={counts[item.itemId] ?? ""}
                        onChange={(event) =>
                          setCounts((prev) => ({
                            ...prev,
                            [item.itemId]: event.target.value,
                          }))
                        }
                        className={cn(
                          "ml-auto w-24 text-right",
                          line?.tooMany && "border-destructive",
                        )}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      {line?.draw ?? "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {!target ? (
                        "–"
                      ) : price === undefined ? (
                        <span className="text-warning">
                          Chưa có trên hợp đồng
                        </span>
                      ) : (
                        moneyText(price ?? 0)
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-sm text-muted-foreground">
            Cộng {amountText(preview.totalMilli, unit)}. Rút Mới trước rồi Tốt,
            như thu hồi. Hàng giữ nguyên tình trạng. Mã chưa có trên hợp đồng
            nhận thì phải lập phụ lục cho hợp đồng đó trước.
          </p>
          {preview.anyOver ? (
            <span className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2">
              <Checkbox
                id="over-contract"
                checked={overContract}
                onCheckedChange={(checked) => setOverContract(checked === true)}
              />
              <Label htmlFor="over-contract">
                Chuyển nhiều hơn số hợp đồng nhận còn phải giao, vẫn chuyển
              </Label>
            </span>
          ) : null}
        </section>

        <section
          aria-labelledby="confirm-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="confirm-title" className="text-h2">
            Ai xác nhận
          </h2>
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as ConfirmMode)}
            aria-label="Ai xác nhận"
            className="grid gap-2 md:grid-cols-2"
          >
            {(
              [
                [
                  "OFFICE",
                  "Văn phòng xác nhận ngay",
                  'Xe đã chở xong, người đi xe đã báo. Ghi sổ ngay khi bấm "Xác nhận chuyển".',
                ],
                [
                  "PHONE",
                  "Gửi điện thoại xác nhận",
                  "Người đi xe bấm xác nhận trên điện thoại khi hàng tới nơi, được sửa số thực chở.",
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <Label
                key={value}
                htmlFor={`mode-${value}`}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 font-normal",
                  mode === value &&
                    "border-2 border-primary px-[11px] py-[9px]",
                )}
              >
                <RadioGroupItem
                  id={`mode-${value}`}
                  value={value}
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-label">{label}</span>
                  <span className="text-caption text-muted-foreground">
                    {hint}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transfer-plate">Biển số xe</Label>
              <Input
                id="transfer-plate"
                value={plate}
                maxLength={20}
                onChange={(event) => setPlate(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transfer-note">Ghi chú</Label>
              <Input
                id="transfer-note"
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>
          <FormError message={error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run("DRAFT")}
            >
              Lưu nháp
            </Button>
            <Button disabled={busy} onClick={() => void run("CONFIRM")}>
              {mode === "OFFICE" ? "Xác nhận chuyển" : "Gửi điện thoại"}
            </Button>
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <section
          aria-labelledby="impact-title"
          className="flex flex-col gap-3 rounded-lg border bg-card p-5"
        >
          <h2 id="impact-title" className="text-label text-muted-foreground">
            Chuyển sang {toSite}
          </h2>
          <p className="text-h1 tabular-nums">
            {amountText(preview.totalMilli, unit)}
          </p>
          <p className="text-sm text-muted-foreground">
            Ngày chuyển = ngày ghi sổ:{" "}
            <span data-clock>{formatBusinessDate(today)}</span>
          </p>
          <h3 className="text-h3">Ảnh hưởng tới tiền thuê</h3>
          <ul className="flex flex-col gap-1 text-sm">
            <li>
              {data.from.siteName} (hợp đồng đi) tính đến hết{" "}
              <span data-clock>{formatBusinessDate(today).slice(0, 5)}</span>
            </li>
            <li>
              {toSite} (hợp đồng nhận) tính từ{" "}
              <span data-clock>
                {formatBusinessDate(addDays(today, 1)).slice(0, 5)}
              </span>
            </li>
            <li>
              Tiền thuê 1 ngày ở {data.from.siteName} giảm{" "}
              {moneyText(-preview.dailyDrop)}
            </li>
            {preview.lines.map((line) => (
              <li key={line.item.itemId}>
                Còn phải giao ở {toSite} {line.item.code} {remainingText(line)}
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted-foreground">
            {minimumText(preview.sameCustomer, data.from.siteName, toSite)}
          </p>
          <p className="text-caption text-muted-foreground">
            Hàng hỏng phát hiện khi chuyển không chuyển được. Đưa về bãi bằng
            phiếu thu hồi để tính đền bù.
          </p>
        </section>
      </aside>
    </div>
  );
}
