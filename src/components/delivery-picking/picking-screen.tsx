"use client";

// M5 "Nhặt hàng xuất kho" (delivery-picking spec, deliveries design D1,
// D13). The page loads the note once; picking runs here on the draft, so it
// goes on when the signal drops. Starting needs the network; confirming
// queues the draft when offline. No price, freight or money is shown.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConditionBadge } from "@/components/domain/condition-badge";
import { Stepper } from "@/components/domain/stepper";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBusinessDate, formatDateTime } from "@/domain/business-date";
import { CONDITION_LABELS, type Condition } from "@/domain/condition";
import { RENTAL_PICK_CONDITIONS } from "@/domain/delivery-note";
import {
  formatQuantity,
  formatQuantityForInput,
  parseQuantity,
  QUANTITY_UNIT_LABELS,
  toQuantity,
} from "@/domain/quantity";
import { useDraft } from "@/hooks/use-draft";
import { callApi, NETWORK_ERROR_MESSAGE } from "@/lib/api-client";
import type { MobileLine, MobileNote } from "@/lib/deliveries/queries";
import { outboxFor, postedNotices } from "@/lib/drafts/runtime";

import {
  blockingErrors,
  defaultCondition,
  emptyPicks,
  estimateFromKg,
  lineView,
  pickAll,
  postBodyOf,
  progressText,
  shortageQuestion,
  type LinePicks,
  type PickingPayload,
} from "./picking-model";

export const PICKING_MESSAGES = {
  offlineStart: "Bạn cần có mạng để bắt đầu nhặt phiếu này.",
  queued: "Chưa gửi được, sẽ tự gửi khi có mạng",
  signedOut: "Phiên đăng nhập hết hạn. Đăng nhập lại để gửi phiếu.",
  plate: "Bạn nhập biển số xe chở hàng.",
  returnReason: "Bạn ghi lý do để văn phòng biết cần đổi gì.",
} as const;

interface PickingScreenProps {
  note: MobileNote;
  userId: string;
}

const amount = (milli: number, unit: MobileLine["unit"]) =>
  `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;

function milliOrZero(text: string | undefined, unit: MobileLine["unit"]) {
  try {
    return text ? parseQuantity(text, unit).milli : 0;
  } catch {
    return 0;
  }
}

export function PickingScreen({ note, userId }: PickingScreenProps) {
  const router = useRouter();
  const draft = useDraft<PickingPayload>({
    kind: "DELIVERY",
    userId,
    documentRef: note.code,
    title: `Xuất ${note.code} · ${note.place}`,
    initial: () => ({
      noteId: note.id,
      code: note.code,
      startedVersion: note.status === "PICKING" ? note.version : "",
      vehiclePlate: note.vehiclePlate ?? "",
      lines: {},
      departedAt: null,
    }),
    progressOf: (payload) => progressText(note.lines, payload),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [estimates, setEstimates] = useState<Record<string, string | null>>({});
  const [extra, setExtra] = useState<Record<string, Condition[]>>({});

  if (note.status === "POSTED" || note.status === "CANCELLED") {
    return <PostedNote note={note} />;
  }
  if (!draft.ready) {
    return <p className="text-body text-muted-foreground">Đang mở phiếu…</p>;
  }

  const payload = draft.payload;
  const picking = note.status === "PICKING";
  const locked = !picking || !draft.editable || busy;
  const queued =
    draft.record?.state === "QUEUED" || draft.record?.state === "SENDING";
  const rejected =
    draft.record?.state === "REJECTED" ? draft.record.error : null;
  const rental = note.contractType === "RENTAL";

  const setLine = (lineId: string, change: (current: LinePicks) => LinePicks) =>
    draft.update((current) => ({
      ...current,
      lines: {
        ...current.lines,
        [lineId]: change(current.lines[lineId] ?? emptyPicks()),
      },
    }));

  async function start() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setMessage(PICKING_MESSAGES.offlineStart);
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await callApi<{ updatedAt: string }>(
      `/api/m/deliveries/${encodeURIComponent(note.code)}/start`,
      { method: "POST", body: {} },
    );
    setBusy(false);
    if (!result.ok) {
      setMessage(
        result.error === NETWORK_ERROR_MESSAGE
          ? PICKING_MESSAGES.offlineStart
          : result.error,
      );
      return;
    }
    // Picking afresh: the numbers of a recalled note do not carry over.
    draft.update({
      ...payload,
      lines:
        payload.startedVersion === result.data.updatedAt ? payload.lines : {},
      startedVersion: result.data.updatedAt,
    });
    await draft.saveNow();
    router.refresh();
  }

  async function confirm(skipShortage = false) {
    setMessage(null);
    if (payload.vehiclePlate.trim() === "") {
      setMessage(PICKING_MESSAGES.plate);
      return;
    }
    const errors = blockingErrors(note.lines, payload);
    if (errors.length > 0) {
      setMessage(errors.join(" "));
      return;
    }
    const question = shortageQuestion(note.lines, payload);
    if (question && !skipShortage) {
      setAsking(question);
      return;
    }
    setAsking(null);
    setBusy(true);
    const departedAt = new Date().toISOString();
    const saved = await draft.saveNow({
      payload: {
        ...payload,
        departedAt,
        body: postBodyOf(note.lines, payload, departedAt),
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
      setMessage(PICKING_MESSAGES.signedOut);
    } else if (outcome.kind === "RETRY") {
      setMessage(PICKING_MESSAGES.queued);
    }
  }

  async function giveBack() {
    const text = reason.trim();
    if (text === "") {
      setMessage(PICKING_MESSAGES.returnReason);
      return;
    }
    setBusy(true);
    const result = await callApi(
      `/api/m/deliveries/${encodeURIComponent(note.code)}/return`,
      { method: "POST", body: { reason: text } },
    );
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    await draft.remove();
    setReturning(false);
    router.push("/m");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 pb-40">
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-h2">Xuất {note.code}</h2>
        <p className="text-label text-muted-foreground">
          {note.place}
          {note.plannedDate
            ? ` · xe ${formatBusinessDate(note.plannedDate)}`
            : ""}{" "}
          · Đợt {note.batchNo}
        </p>
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <span className="text-caption text-muted-foreground">Đã nhặt</span>
          <span className="font-display text-h2 tabular-nums">
            {progressText(note.lines, payload)}
          </span>
        </div>
        <p className="text-body text-muted-foreground">
          {note.kitsText ? `${note.kitsText} đã tự tách thành linh kiện. ` : ""}
          {rental
            ? "Chỉ lấy hàng Mới hoặc Tốt."
            : "Lấy đúng tình trạng ghi trên từng dòng."}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plate">Biển số xe chở hàng</Label>
          <Input
            id="plate"
            value={payload.vehiclePlate}
            disabled={locked}
            maxLength={20}
            placeholder="51X-000.01"
            onChange={(event) =>
              draft.update({ ...payload, vehiclePlate: event.target.value })
            }
            className="h-12"
          />
        </div>
      </section>

      {(queued || message || rejected) && (
        <p
          role="status"
          className="rounded-lg border-2 border-warning bg-card p-4 text-label"
        >
          {message ?? rejected ?? PICKING_MESSAGES.queued}
        </p>
      )}

      {!picking ? (
        <Button className="h-12" disabled={busy} onClick={() => void start()}>
          Bắt đầu nhặt
        </Button>
      ) : null}

      <fieldset
        disabled={locked}
        aria-label="Danh sách nhặt hàng"
        className="flex min-w-0 flex-col gap-4"
      >
        <h2 className="text-h3">Danh sách nhặt hàng</h2>
        {note.lines.map((line) => {
          const picks = payload.lines[line.id] ?? emptyPicks();
          const view = lineView(line, picks);
          const first = defaultCondition(line);
          const shownConditions: Condition[] = rental
            ? RENTAL_PICK_CONDITIONS.filter(
                (condition) =>
                  condition === first ||
                  picks.quantities[condition] !== undefined ||
                  (extra[line.id] ?? []).includes(condition),
              )
            : [line.condition as Condition];
          const other = RENTAL_PICK_CONDITIONS.find(
            (condition) => !shownConditions.includes(condition),
          );
          return (
            <article
              key={line.id}
              aria-label={line.itemCode}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4"
            >
              <div className="flex flex-col gap-1">
                <p className="text-label">
                  {line.itemName}{" "}
                  <span className="text-muted-foreground">
                    · {line.itemCode}
                  </span>
                </p>
                <p className="text-body text-muted-foreground">
                  {line.stock
                    .map(
                      (row) =>
                        `${CONDITION_LABELS[row.condition]} tồn ${formatQuantity(toQuantity(row.milli, line.unit))}`,
                    )
                    .join(" · ")}{" "}
                  · cần {amount(line.requestedMilli, line.lineUnit)}
                </p>
                <p
                  className={
                    view.done ? "text-label text-success" : "text-label"
                  }
                >
                  {view.status}
                </p>
              </div>
              {shownConditions.map((condition) => {
                const value = toQuantity(
                  milliOrZero(picks.quantities[condition], line.unit),
                  line.unit,
                );
                return (
                  <div
                    key={condition}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <ConditionBadge condition={condition} />
                    <Stepper
                      label={`${line.itemCode} ${CONDITION_LABELS[condition]}`}
                      value={value}
                      onValueChange={(next) =>
                        setLine(line.id, (current) => ({
                          ...current,
                          quantities: {
                            ...current.quantities,
                            [condition]: formatQuantityForInput(next),
                          },
                          piecesEstimated: false,
                        }))
                      }
                    />
                    {!line.byKg ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-11"
                        disabled={locked}
                        onClick={() =>
                          setLine(line.id, (current) => ({
                            ...current,
                            quantities: pickAll(line, condition),
                          }))
                        }
                      >
                        Nhặt đủ
                      </Button>
                    ) : null}
                  </div>
                );
              })}
              {rental && other ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="self-start"
                  disabled={locked}
                  onClick={() =>
                    setExtra((current) => ({
                      ...current,
                      [line.id]: [...(current[line.id] ?? []), other],
                    }))
                  }
                >
                  Thêm hàng {CONDITION_LABELS[other]}
                </Button>
              ) : null}
              {line.byKg ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`kg-${line.id}`}>Kg cân</Label>
                  <Input
                    id={`kg-${line.id}`}
                    inputMode="decimal"
                    value={picks.weighedKg}
                    disabled={locked}
                    className="h-12 text-right tabular-nums"
                    onChange={(event) => {
                      const weighedKg = event.target.value;
                      const counted =
                        picks.quantities[line.condition as Condition];
                      const guess =
                        !counted || picks.piecesEstimated
                          ? estimateFromKg(line, weighedKg)
                          : null;
                      setEstimates((current) => ({
                        ...current,
                        [line.id]: guess?.note ?? null,
                      }));
                      setLine(line.id, (current) => ({
                        ...current,
                        weighedKg,
                        ...(guess
                          ? {
                              quantities: {
                                [line.condition as Condition]: guess.quantity,
                              },
                              piecesEstimated: true,
                            }
                          : {}),
                      }));
                    }}
                  />
                  {picks.piecesEstimated ? (
                    <span className="text-caption text-muted-foreground">
                      Số cái là ước tính từ kg cân, bạn sửa được.
                    </span>
                  ) : null}
                  {estimates[line.id] ? (
                    <span className="text-caption text-warning">
                      {estimates[line.id]}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {view.error ? (
                <p role="alert" className="text-caption text-destructive">
                  {view.error}
                </p>
              ) : null}
            </article>
          );
        })}
      </fieldset>

      {picking ? (
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          disabled={busy || queued}
          onClick={() => setReturning(true)}
        >
          Trả lại văn phòng
        </Button>
      ) : null}

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t bg-card">
        <div className="mx-auto grid max-w-[640px] grid-cols-[auto_1fr] gap-2 px-4 py-3">
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
            disabled={locked}
            onClick={() => void confirm()}
          >
            Xác nhận xe rời bãi
          </Button>
        </div>
      </div>

      <Dialog
        open={asking !== null}
        onOpenChange={(open) => (open ? null : setAsking(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xuất thiếu?</DialogTitle>
            <DialogDescription>{asking}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              Nhặt tiếp
            </Button>
            <Button onClick={() => void confirm(true)} disabled={busy}>
              Vẫn xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returning} onOpenChange={setReturning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trả lại văn phòng?</DialogTitle>
            <DialogDescription>
              Phiếu về Chờ nhặt, số đã nhặt trên máy này sẽ bị xóa.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="return-reason">Lý do</Label>
          <textarea
            id="return-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="rounded-md border border-input bg-card px-3 py-2 text-base"
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReturning(false)}>
              Đóng
            </Button>
            <Button onClick={() => void giveBack()} disabled={busy}>
              Trả lại văn phòng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A note already posted (or cancelled): what left the yard, no price. */
function PostedNote({ note }: { note: MobileNote }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-h2">Xuất {note.code}</h2>
      <p className="text-label text-muted-foreground">
        {note.place} · Đợt {note.batchNo}
      </p>
      {note.status === "CANCELLED" ? (
        <p className="rounded-lg border bg-card p-4 text-body">Phiếu đã hủy.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border bg-card p-4 text-body">
          <dt className="text-muted-foreground">Ngày giao</dt>
          <dd>
            {note.businessDate ? formatBusinessDate(note.businessDate) : ""}
          </dd>
          <dt className="text-muted-foreground">Xác nhận</dt>
          <dd>
            {note.postedByName ?? ""}
            {note.postedAt
              ? ` · ${formatDateTime(new Date(note.postedAt))}`
              : ""}
          </dd>
          <dt className="text-muted-foreground">Xe</dt>
          <dd>{note.vehiclePlate ?? ""}</dd>
        </dl>
      )}
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {note.lines.map((line) => (
          <li key={line.id} className="flex flex-col gap-1 px-4 py-3">
            <span className="text-label">
              {line.itemName} · {line.itemCode}
            </span>
            <span className="text-body text-muted-foreground">
              {line.picks.length === 0
                ? `Không xuất (cần ${amount(line.requestedMilli, line.lineUnit)})`
                : line.picks
                    .map(
                      (pick) =>
                        `${CONDITION_LABELS[pick.condition]} ${pick.piecesEstimated ? "≈ " : ""}${amount(pick.quantityMilli, line.unit)}${
                          pick.weighedMilli !== null && line.byKg
                            ? ` · ${amount(pick.weighedMilli, "KG")}`
                            : ""
                        }`,
                    )
                    .join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
