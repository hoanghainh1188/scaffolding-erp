"use client";

// M9 "Xác nhận chuyển công trình" (spec site-transfers, design D1 way 2).
// The person on the truck lowers what was carried, never raises it, and
// confirms once the goods are down at the receiving site. The draft keeps
// the numbers when the signal drops. No price is shown.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Stepper } from "@/components/domain/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatQuantityForInput, toQuantity } from "@/domain/quantity";
import { useDraft } from "@/hooks/use-draft";
import { outboxFor, postedNotices } from "@/lib/drafts/runtime";
import type { TransferView } from "@/lib/site-transfers/queries";

import {
  lineNote,
  movedMilli,
  plannedMilli,
  postBodyOf,
  totalText,
  type TransferConfirmPayload,
} from "./transfer-confirm-model";
import { TransferDetail } from "./transfer-detail";

const MESSAGES = {
  queued: "Chưa gửi được, sẽ tự gửi khi có mạng",
  signedOut: "Phiên đăng nhập hết hạn. Đăng nhập lại để gửi phiếu.",
} as const;

export function TransferConfirmScreen({
  transfer,
  userId,
}: {
  transfer: TransferView;
  userId: string;
}) {
  const router = useRouter();
  const draft = useDraft<TransferConfirmPayload>({
    kind: "TRANSFER",
    userId,
    documentRef: transfer.code,
    title: `Chuyển ${transfer.code} · ${transfer.to.siteName}`,
    initial: () => ({
      moved: {},
      vehiclePlate: transfer.vehiclePlate ?? "",
      confirmedOnDeviceAt: null,
    }),
    progressOf: (payload) => totalText(transfer.lines, payload),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (transfer.status !== "SENT") return <TransferDetail view={transfer} />;
  if (!draft.ready) {
    return <p className="text-body text-muted-foreground">Đang mở phiếu…</p>;
  }
  const payload = draft.payload;
  const queued =
    draft.record?.state === "QUEUED" || draft.record?.state === "SENDING";
  const rejected =
    draft.record?.state === "REJECTED" ? draft.record.error : null;
  const locked = !draft.editable || busy;

  async function confirm() {
    setMessage(null);
    setBusy(true);
    const at = new Date().toISOString();
    const saved = await draft.saveNow({
      payload: {
        ...payload,
        confirmedOnDeviceAt: at,
        body: postBodyOf(transfer.lines, payload, at),
      },
      state: "QUEUED",
    });
    const outcome = await outboxFor(userId).submit(saved.draftId);
    setBusy(false);
    if (outcome.kind === "POSTED") {
      postedNotices.clear();
      router.push("/m");
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
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-h2">Chuyển công trình</h2>
        <p className="text-label text-muted-foreground">
          {transfer.code} · chờ xác nhận
        </p>
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <span className="text-caption text-muted-foreground">Lấy ở</span>
          <span className="text-label">{transfer.from.siteName}</span>
          <span className="mt-2 text-caption text-muted-foreground">
            Chở tới
          </span>
          <span className="text-label">{transfer.to.siteName}</span>
          {transfer.to.siteAddress ? (
            <span className="text-body text-muted-foreground">
              {transfer.to.siteAddress}
            </span>
          ) : null}
        </div>
      </section>

      {(queued || message || rejected) && (
        <p
          role="status"
          className="rounded-lg border-2 border-warning bg-card p-4 text-label"
        >
          {message ?? rejected ?? MESSAGES.queued}
        </p>
      )}

      <fieldset
        disabled={locked}
        aria-label="Hàng chuyển"
        className="flex min-w-0 flex-col gap-4"
      >
        {transfer.lines.map((line) => {
          const planned = plannedMilli(line);
          return (
            <article
              key={line.itemId}
              aria-label={line.itemCode}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4"
            >
              <p className="text-label">
                {line.itemName}{" "}
                <span className="text-muted-foreground">
                  · {line.itemCode} · văn phòng ghi {line.planned}
                </span>
              </p>
              <Stepper
                label={`Thực chở ${line.itemCode}`}
                value={toQuantity(movedMilli(line, payload), line.unit)}
                min={0}
                max={planned / 1000}
                onValueChange={(next) =>
                  draft.update({
                    ...payload,
                    moved: {
                      ...payload.moved,
                      [line.itemId]: formatQuantityForInput(next),
                    },
                  })
                }
              />
              <p className="text-body text-muted-foreground">
                {lineNote(line, payload, transfer.from.siteName)}
              </p>
            </article>
          );
        })}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-plate">Biển số xe</Label>
          <Input
            id="transfer-plate"
            value={payload.vehiclePlate}
            maxLength={20}
            onChange={(event) =>
              draft.update({ ...payload, vehiclePlate: event.target.value })
            }
            className="h-12"
          />
        </div>
        <p className="text-body text-muted-foreground">
          Bấm xác nhận khi hàng đã hạ ở {transfer.to.siteName}. Hàng hỏng không
          chuyển: để lại xe, chở về bãi làm thu hồi.
        </p>
      </fieldset>

      <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <span className="text-caption text-muted-foreground">
          {totalText(transfer.lines, payload)} · nháp đã lưu trên máy
        </span>
        <Button
          className="h-12"
          disabled={locked}
          onClick={() => void confirm()}
        >
          Xác nhận đã chuyển tới {transfer.to.siteName}
        </Button>
      </div>
    </div>
  );
}
