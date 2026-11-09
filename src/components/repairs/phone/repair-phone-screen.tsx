"use client";

// M8 "Sửa chữa tại xưởng" (repair-work-orders spec repair-mobile;
// docs/design/screens/M8-Repair.dc.html): the workshop takes the order,
// records repaired / scrap and supplies, reports; the storekeeper counts on
// the same screen. The numbers live in a draft on the phone until sent
// (0.2 số 129). No price.
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { QuantityInput } from "@/components/domain/quantity-input";
import { Stepper } from "@/components/domain/stepper";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  quantityFromDb,
  toQuantity,
} from "@/domain/quantity";
import { formatBusinessDate, toBusinessDate } from "@/domain/business-date";
import { WORK_ORDER_STATUS_LABELS } from "@/domain/repair-work-order";
import { useDraft } from "@/hooks/use-draft";
import { callApi } from "@/lib/api-client";
import { outboxFor, postedNotices } from "@/lib/drafts/runtime";
import type { PhoneOrder, PhoneSupply } from "@/lib/repairs/phone-queries";

import {
  allAddUp,
  footerText,
  initialPayload,
  lineError,
  lineOf,
  receivedText,
  stepBody,
  type RepairPhonePayload,
} from "./repair-phone-model";

const MESSAGES = {
  queued: "Chưa gửi được, sẽ tự gửi khi có mạng",
  signedOut: "Phiên đăng nhập hết hạn. Đăng nhập lại để gửi.",
  reopened: "Lệnh đã đổi, đã mở số mới",
} as const;

interface RepairPhoneScreenProps {
  order: PhoneOrder;
  supplies: PhoneSupply[];
  userId: string;
  /** "work": the workshop (report); "count": the storekeeper. */
  mode: "work" | "count";
}

function ReceiveCard({ order }: { order: PhoneOrder }) {
  const router = useRouter();
  // One draft id per order on this screen, so a second press resends it.
  const [draftId] = useState(() => crypto.randomUUID());
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = order.lines.reduce(
    (sum, line) => sum + quantityFromDb(line.taken, line.unit).milli,
    0,
  );
  async function receive() {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/m/repairs/${order.code}/receive`, {
      method: "POST",
      body: { draftId, updatedAt: order.updatedAt },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <p className="text-label">
        Lấy tại {order.fromCode} về {order.workshopCode}:{" "}
        {formatQuantity(toQuantity(total, "PIECE"))} cái Chờ sửa
      </p>
      {asking ? (
        <div
          role="alertdialog"
          aria-label="Nhận lệnh"
          className="flex flex-col gap-3"
        >
          <p className="text-body">
            Nhận {formatQuantity(toQuantity(total, "PIECE"))} cái từ{" "}
            {order.fromCode} về {order.workshopCode}? Sổ kho sẽ ghi chuyển hàng.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-12 flex-1"
              onClick={() => setAsking(false)}
            >
              Thôi
            </Button>
            <Button
              className="h-12 flex-1"
              disabled={busy}
              onClick={() => void receive()}
            >
              Nhận lệnh
            </Button>
          </div>
        </div>
      ) : (
        <Button className="h-12" onClick={() => setAsking(true)}>
          Nhận lệnh
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function RepairPhoneScreen({
  order,
  supplies,
  userId,
  mode,
}: RepairPhoneScreenProps) {
  const router = useRouter();
  const draft = useDraft<RepairPhonePayload>({
    kind: "REPAIR",
    userId,
    documentRef: order.code,
    version: order.updatedAt,
    title: `${mode === "count" ? "Đếm" : "Sửa"} ${order.code}`,
    initial: () => initialPayload(order),
    progressOf: (payload) => footerText(order, payload),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const header = (
    <section className="flex flex-col gap-1">
      <h2 className="font-display text-h2">Lệnh sửa chữa</h2>
      <p className="text-label">{order.code}</p>
      <p className="text-body text-muted-foreground">
        {WORK_ORDER_STATUS_LABELS[order.status]}
        {order.repairedBy ? ` · ${order.repairedBy}` : ""} ·{" "}
        {order.workshopCode}
      </p>
    </section>
  );

  if (order.status === "ASSIGNED") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {mode === "work" ? (
          <ReceiveCard order={order} />
        ) : (
          <p className="text-body text-muted-foreground">
            Chờ xưởng nhận lệnh.
          </p>
        )}
      </div>
    );
  }
  const workable =
    (mode === "work" && order.status === "IN_PROGRESS") ||
    (mode === "count" && order.status === "AWAITING_CHECK");
  if (!workable) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-body text-muted-foreground">
          {mode === "work"
            ? "Lệnh đã báo sửa xong, chờ Thủ kho đếm."
            : "Lệnh chưa chờ nghiệm thu."}
        </p>
      </div>
    );
  }
  if (!draft.ready) {
    return <p className="text-body text-muted-foreground">Đang mở lệnh…</p>;
  }
  const payload = draft.payload;
  const queued =
    draft.record?.state === "QUEUED" || draft.record?.state === "SENDING";
  const rejected =
    draft.record?.state === "REJECTED" ? draft.record.error : null;
  const locked = !draft.editable || busy;
  // "03/11": the Vietnam day the workshop took the stock.
  const received = order.receivedAt
    ? formatBusinessDate(toBusinessDate(new Date(order.receivedAt))).slice(0, 5)
    : null;
  const total = order.lines.reduce(
    (sum, line) => sum + quantityFromDb(line.taken, line.unit).milli,
    0,
  );

  const setLine = (itemId: string, next: Partial<ReturnType<typeof lineOf>>) =>
    draft.update({
      ...payload,
      lines: {
        ...payload.lines,
        [itemId]: { ...lineOf(payload, itemId), ...next },
      },
    });

  async function send() {
    setMessage(null);
    setBusy(true);
    const step = mode === "count" ? "count" : "report";
    const version = draft.record?.version ?? order.updatedAt;
    const saved = await draft.saveNow({
      payload: { ...payload, step, body: stepBody(order, payload, version) },
      state: "QUEUED",
    });
    const outcome = await outboxFor(userId).submit(saved.draftId);
    setBusy(false);
    if (outcome.kind === "POSTED") {
      postedNotices.clear();
      router.push("/m/repairs");
      router.refresh();
    } else if (outcome.kind === "REJECTED") {
      router.refresh();
    } else if (outcome.kind === "SIGNED_OUT") {
      setMessage(MESSAGES.signedOut);
    } else if (outcome.kind === "RETRY") {
      setMessage(MESSAGES.queued);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-40">
      {header}
      {received ? (
        <p className="text-body">
          Đã nhận {formatQuantity(toQuantity(total, "PIECE"))} cái từ{" "}
          {order.fromCode} ngày <span data-mask>{received}</span>. Sửa xong +
          Phế phải bằng số nhận.
        </p>
      ) : null}
      {order.returnNote ? (
        <p
          role="status"
          className="rounded-lg border-2 border-warning bg-card p-4 text-label"
        >
          Văn phòng trả lại: {order.returnNote}
        </p>
      ) : null}
      {(queued || message || rejected || draft.reopened) && (
        <p
          role="status"
          className="rounded-lg border-2 border-warning bg-card p-4 text-label"
        >
          {message ??
            rejected ??
            (queued ? MESSAGES.queued : MESSAGES.reopened)}
        </p>
      )}
      <fieldset
        disabled={locked}
        aria-label="Hàng sửa"
        className="flex min-w-0 flex-col gap-4"
      >
        {order.lines.map((line) => {
          const current = lineOf(payload, line.itemId);
          const error = lineError(line, current);
          const taken = quantityFromDb(line.taken, line.unit).milli / 1000;
          const reported =
            mode === "count" && line.reportedGood !== null
              ? `Xưởng báo ${formatQuantity(quantityFromDb(line.reportedGood, line.unit))} sửa xong, ${formatQuantity(quantityFromDb(line.reportedScrap ?? "0", line.unit))} phế`
              : null;
          const unused = supplies.filter(
            (supply) =>
              !current.materials.some(
                (material) => material.itemId === supply.itemId,
              ),
          );
          return (
            <article
              key={line.itemId}
              aria-label={line.code}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4"
            >
              <p className="text-label">
                {line.name}{" "}
                <span className="text-muted-foreground">
                  {line.code} · {receivedText(line)}
                </span>
              </p>
              {reported ? (
                <p className="text-caption text-muted-foreground">{reported}</p>
              ) : null}
              <span className="text-label">Sửa xong</span>
              <Stepper
                label="Sửa xong"
                value={toQuantity(current.goodMilli, line.unit)}
                min={0}
                max={taken}
                onValueChange={(next) =>
                  setLine(line.itemId, { goodMilli: next.milli })
                }
              />
              <span className="text-label">Hỏng → Phế</span>
              <Stepper
                label="Hỏng → Phế"
                value={toQuantity(current.scrapMilli, line.unit)}
                min={0}
                max={taken}
                onValueChange={(next) =>
                  setLine(line.itemId, { scrapMilli: next.milli })
                }
              />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                <span className="text-label">Vật tư đã dùng</span>
                {current.materials.map((material, index) => (
                  <div key={material.itemId} className="flex items-end gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <Label
                        htmlFor={`supply-${line.itemId}-${material.itemId}`}
                      >
                        {material.name} {material.code} ·{" "}
                        {QUANTITY_UNIT_LABELS[material.unit]}
                      </Label>
                      <QuantityInput
                        id={`supply-${line.itemId}-${material.itemId}`}
                        value={toQuantity(material.milli, material.unit)}
                        onValueChange={(next) =>
                          setLine(line.itemId, {
                            materials: current.materials.map((other, at) =>
                              at === index
                                ? { ...other, milli: next.milli }
                                : other,
                            ),
                          })
                        }
                        className="h-12"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-12"
                      aria-label={`Bỏ ${material.code}`}
                      onClick={() =>
                        setLine(line.itemId, {
                          materials: current.materials.filter(
                            (_, at) => at !== index,
                          ),
                        })
                      }
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                ))}
                {adding === line.itemId ? (
                  <select
                    aria-label={`Chọn vật tư cho ${line.code}`}
                    className="h-12 rounded-md border bg-card px-3 text-base"
                    defaultValue=""
                    onChange={(event) => {
                      const supply = supplies.find(
                        (row) => row.itemId === event.target.value,
                      );
                      if (!supply) return;
                      setLine(line.itemId, {
                        materials: [
                          ...current.materials,
                          {
                            itemId: supply.itemId,
                            code: supply.code,
                            name: supply.name,
                            unit: supply.unit,
                            milli: 0,
                          },
                        ],
                      });
                      setAdding(null);
                    }}
                  >
                    <option value="">Chọn vật tư</option>
                    {unused.map((supply) => (
                      <option key={supply.itemId} value={supply.itemId}>
                        {supply.name} · {supply.code}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12"
                    disabled={unused.length === 0}
                    onClick={() => setAdding(line.itemId)}
                  >
                    <Plus aria-hidden /> Thêm vật tư
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </fieldset>
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t bg-card">
        <div className="mx-auto flex max-w-[640px] flex-col gap-2 px-4 py-3">
          <span className="text-caption text-muted-foreground">
            {footerText(order, payload)} · nháp đã lưu trên máy
          </span>
          <Button
            type="button"
            className="h-12"
            disabled={locked || !allAddUp(order, payload)}
            onClick={() => void send()}
          >
            {mode === "count" ? "Đếm xong" : "Báo sửa xong"}
          </Button>
        </div>
      </div>
    </div>
  );
}
