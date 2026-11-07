"use client";

// M3 "Nhập hàng từ đơn mua" (spec goods-receipts, design D1, D5b, D12). The
// page loads the order once; everything after runs here, so counting goes
// on when the signal drops. The draft is the single source of the form.
import { ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { QrScanner } from "@/components/scan/qr-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDateTime } from "@/domain/business-date";
import { LANDED_COST_MESSAGES } from "@/domain/landed-cost";
import { formatMoney } from "@/domain/money";
import { PURCHASE_KIND_LABELS } from "@/domain/purchase-order";
import type { Anomaly } from "@/domain/receipt-anomalies";
import { useDraft } from "@/hooks/use-draft";
import { outboxFor, postedNotices } from "@/lib/drafts/runtime";
import { preloadQrDetector } from "@/lib/scan/detector";

import { AnomalyDialog } from "./anomaly-dialog";
import {
  alignForm,
  confirmHint,
  initialForm,
  pendingAnomalies,
  progressText,
  toBody,
  tripCostTotal,
  type LineForm,
  type ReceiptDraftPayload,
  type ReceiptForm,
  type ReceivingOrder,
} from "./receipt-model";
import { ReceiptLineCard } from "./receipt-line-card";
import { TripCosts } from "./trip-costs";

export const RECEIPT_FORM_MESSAGES = {
  queued: "Chưa gửi được, sẽ tự gửi khi có mạng",
  signedOut: "Phiên đăng nhập hết hạn. Đăng nhập lại để gửi phiếu.",
} as const;

interface ReceiptFormViewProps {
  order: ReceivingOrder;
  userId: string;
  draftId?: string | null;
}

interface FieldError {
  field: string;
  message: string;
}

const timeOf = (iso: string) => formatDateTime(new Date(iso)).slice(11);

export function ReceiptFormView({
  order,
  userId,
  draftId,
}: ReceiptFormViewProps) {
  const router = useRouter();
  const draft = useDraft<ReceiptDraftPayload>({
    kind: "GOODS_RECEIPT",
    userId,
    documentRef: order.code,
    title: `Nhập ${order.code} · ${order.supplierName}`,
    draftId,
    initial: () => ({ form: initialForm(order, new Date()), body: null }),
    progressOf: (payload) =>
      progressText(order, alignForm(payload.form, order)).replace(
        "xong",
        "đã đếm",
      ),
  });
  const form = alignForm(draft.payload.form, order);
  const [asking, setAsking] = useState<Anomaly | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cards = useRef(new Map<string, HTMLElement>());

  useEffect(() => preloadQrDetector(), []);

  const locked = !draft.editable;
  const hint = confirmHint(order, form);
  const total = tripCostTotal(form);
  const queued =
    draft.record?.state === "QUEUED" || draft.record?.state === "SENDING";
  const rejected =
    draft.record?.state === "REJECTED" ? draft.record.error : null;
  const showsScrap =
    order.kind === "USED" && form.lines.some((line) => line.scrap > 0);

  const setForm = (change: (current: ReceiptForm) => ReceiptForm) =>
    draft.update((payload) => ({
      form: change(alignForm(payload.form, order)),
      body: null,
    }));

  const setLine = (index: number, line: LineForm) => {
    setFieldError(null);
    setForm((current) => ({
      ...current,
      lines: current.lines.map((old, i) => (i === index ? line : old)),
      confirmed: current.confirmed.filter(
        (key) => key !== `line:${line.orderLineId}`,
      ),
    }));
  };

  async function send(current: ReceiptForm) {
    const [first] = pendingAnomalies(order, current);
    if (first) {
      setAsking(first);
      return;
    }
    setMessage(null);
    const saved = await draft.saveNow({
      payload: { form: current, body: toBody(order, current) },
      state: "QUEUED",
    });
    const outcome = await outboxFor(userId).submit(saved.draftId);
    if (outcome.kind === "POSTED") {
      // The receipt page says it; the shell banner is for background sends.
      postedNotices.clear();
      router.push(`/m/receipts/${outcome.code}?posted=1`);
    } else if (outcome.kind === "REJECTED") {
      if (outcome.field) {
        setFieldError({ field: outcome.field, message: outcome.error });
      }
      router.refresh();
    } else if (outcome.kind === "SIGNED_OUT") {
      setMessage(RECEIPT_FORM_MESSAGES.signedOut);
    } else if (outcome.kind === "RETRY") {
      setMessage(RECEIPT_FORM_MESSAGES.queued);
    }
  }

  function confirmAnomaly() {
    if (!asking) return;
    const next = { ...form, confirmed: [...form.confirmed, asking.key] };
    setAsking(null);
    draft.update((payload) => ({ ...payload, form: next }));
    void send(next);
  }

  function scanned(code: string) {
    const index = order.lines.findIndex((line) => line.itemCode === code);
    if (index < 0) {
      setNotice(`${code} không có trong đơn ${order.code}`);
      return;
    }
    setNotice(null);
    setScanning(false);
    const line = form.lines[index];
    if (line?.mode === "PENDING") setLine(index, { ...line, mode: "COUNTED" });
    const card = cards.current.get(order.lines[index]?.orderLineId ?? "");
    requestAnimationFrame(() => {
      card?.scrollIntoView({ block: "start" });
      card?.querySelector<HTMLInputElement>("input")?.focus();
    });
  }

  const errorFor = (index: number) =>
    fieldError?.field.startsWith(`lines.${index}.`)
      ? fieldError.message
      : undefined;

  if (!draft.ready) {
    return <p className="text-body text-muted-foreground">Đang mở phiếu…</p>;
  }

  return (
    <div className="flex flex-col gap-6 pb-36">
      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-h2">Nhập hàng {order.code}</h2>
            <p className="text-label text-muted-foreground">
              Chuyến {order.tripNo} · {progressText(order, form)}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="h-12"
            disabled={locked}
            onClick={() => setScanning(true)}
          >
            <ScanLine aria-hidden /> Quét mã
          </Button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border bg-card p-4 text-body">
          <dt className="text-muted-foreground">Người bán</dt>
          <dd>{order.supplierName}</dd>
          <dt className="text-muted-foreground">Xe</dt>
          <dd>
            <Input
              aria-label="Xe"
              value={form.vehicle}
              disabled={locked}
              maxLength={100}
              onChange={(event) => {
                const vehicle = event.target.value;
                setForm((current) => ({ ...current, vehicle }));
              }}
              className="h-10"
            />
          </dd>
          <dt className="text-muted-foreground">Về lúc</dt>
          <dd data-mask className="whitespace-nowrap tabular-nums">
            {timeOf(form.arrivedAt)}
          </dd>
          <dt className="text-muted-foreground">Loại hàng</dt>
          <dd>{PURCHASE_KIND_LABELS[order.kind]}</dd>
          {order.yards.length > 1 && (
            <>
              <dt className="text-muted-foreground">
                <label htmlFor="receipt-yard">
                  {order.materialsOnly ? "Nhập vào" : "Bãi nhập"}
                </label>
              </dt>
              <dd>
                <select
                  id="receipt-yard"
                  value={form.locationId ?? ""}
                  disabled={locked}
                  onChange={(event) => {
                    const locationId = event.target.value || null;
                    setForm((current) => ({ ...current, locationId }));
                  }}
                  className="h-10 w-full rounded-md border bg-card px-2"
                >
                  <option value="">
                    {order.materialsOnly ? "Chọn bãi hoặc xưởng" : "Chọn bãi"}
                  </option>
                  {order.yards.map((yard) => (
                    <option key={yard.id} value={yard.id}>
                      {yard.name}
                    </option>
                  ))}
                </select>
              </dd>
            </>
          )}
        </dl>
      </section>

      {(queued || message || rejected) && (
        <p
          role="status"
          className="rounded-lg border-2 border-warning bg-card p-4 text-label"
        >
          {rejected ?? message ?? RECEIPT_FORM_MESSAGES.queued}
        </p>
      )}

      <section aria-label="Đếm và phân loại" className="flex flex-col gap-4">
        <h2 className="text-h3">Đếm và phân loại</h2>
        {order.lines.map((open, index) => {
          const line = form.lines[index];
          if (!line) return null;
          return (
            <ReceiptLineCard
              key={open.orderLineId}
              ref={(node) => {
                if (node) cards.current.set(open.orderLineId, node);
                else cards.current.delete(open.orderLineId);
              }}
              kind={order.kind}
              open={open}
              line={line}
              disabled={locked}
              error={errorFor(index)}
              onChange={(next) => setLine(index, next)}
            />
          );
        })}
        {showsScrap && (
          <p className="text-caption text-muted-foreground">
            {order.scrapPrice
              ? `Giá sắt vụn ${formatMoney(order.scrapPrice.pricePerKg)}/kg, cập nhật ${order.scrapPrice.updated}`
              : LANDED_COST_MESSAGES.noScrapPrice}
          </p>
        )}
      </section>

      <TripCosts
        costs={form.costs}
        total={total}
        prefilled={order.tripNo === 1 && order.prefilledCosts.length > 0}
        method={order.allocationMethod}
        disabled={locked}
        error={
          fieldError?.field.startsWith("costs") ? fieldError.message : undefined
        }
        onChange={(costs) => {
          setFieldError(null);
          setForm((current) => ({
            ...current,
            costs,
            confirmed: current.confirmed.filter((key) => key !== "costs"),
          }));
        }}
      />

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t bg-card">
        <div className="mx-auto flex max-w-[640px] flex-col gap-2 px-4 py-3">
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-12"
              disabled={locked}
              onClick={async () => {
                await draft.saveNow();
                router.push("/m");
              }}
            >
              Lưu nháp
            </Button>
            <Button
              type="button"
              className="h-12"
              disabled={locked || hint !== null}
              onClick={() => void send(form)}
            >
              Xác nhận nhập kho
            </Button>
          </div>
          {hint && !locked && (
            <p className="text-caption text-muted-foreground">{hint}</p>
          )}
        </div>
      </div>

      <AnomalyDialog
        anomaly={asking}
        onCancel={() => {
          const field = asking?.field;
          setAsking(null);
          const index = Number(field?.split(".")[1]);
          const card = Number.isInteger(index)
            ? cards.current.get(order.lines[index]?.orderLineId ?? "")
            : null;
          card?.querySelector<HTMLInputElement>("input")?.focus();
        }}
        onConfirm={confirmAnomaly}
      />

      <Sheet open={scanning} onOpenChange={setScanning}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Quét mã hàng</SheetTitle>
            <SheetDescription>
              Quét nhãn trên hàng để nhảy tới dòng của mã đó.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {scanning && <QrScanner onCode={scanned} notice={notice} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
