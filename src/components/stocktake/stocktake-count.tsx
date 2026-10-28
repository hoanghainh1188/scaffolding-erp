"use client";

// M6 "Đếm hàng" (spec stocktakes, design D5, D7, D8, D10): blind counting
// by item, saved as a phone draft after every change, sent to the office
// through the draft outbox so a lost signal never loses a count.
import { Plus, ScanLine, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ConfirmAction } from "@/components/catalog/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import { STOCKTAKE_MESSAGES } from "@/domain/stocktake";
import { useDraft } from "@/hooks/use-draft";
import { callApi } from "@/lib/api-client";
import { outboxFor, postedNotices } from "@/lib/drafts/runtime";
import { toSearchText } from "@/domain/search-text";
import { cn } from "@/lib/utils";

import { AddItemSheet } from "./add-item-sheet";
import { CountItemCard } from "./count-item-card";
import { ReasonDialog } from "./reason-dialog";
import {
  alignDraft,
  emptyPayload,
  finishError,
  inputText,
  itemsOf,
  progressOf,
  requiredConditions,
  toSubmitItems,
  uncountedLines,
  type CatalogItem,
  type CountViewData,
  type ItemView,
  type StocktakeDraftPayload,
} from "./stocktake-model";

export const STOCKTAKE_COUNT_MESSAGES = {
  queued: "Chưa gửi được, sẽ tự gửi khi có mạng",
  signedOut: "Phiên đăng nhập hết hạn. Đăng nhập lại để gửi kết quả.",
  uncounted: (lines: number) =>
    `Còn ${lines} dòng chưa đếm. Gửi luôn thì các dòng đó không điều chỉnh.`,
} as const;

type Tab = "todo" | "done" | "all";

interface StocktakeCountProps {
  view: CountViewData;
  userId: string;
  /** Holds stocktake.count but not the director's right to cancel later. */
  canCancel: boolean;
}

const nowIso = () => new Date().toISOString();

export function StocktakeCount({
  view,
  userId,
  canCancel,
}: StocktakeCountProps) {
  const router = useRouter();
  const draft = useDraft<StocktakeDraftPayload>({
    kind: "STOCKTAKE",
    userId,
    documentRef: view.code,
    title: `Kiểm kê ${view.code} · ${view.locationCode}`,
    initial: () => emptyPayload(view.round),
    progressOf: (payload) => {
      const { counted, total } = progressOf(view, alignDraft(payload, view));
      return `${counted}/${total} dòng đã đếm`;
    },
  });
  const payload = alignDraft(draft.payload, view);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState<"search" | "scan" | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const cards = useRef(new Map<string, HTMLElement>());

  const recountRound = view.lines.some((line) => line.recount);
  const locked = !draft.editable;
  const queued =
    draft.record?.state === "QUEUED" || draft.record?.state === "SENDING";
  const rejected =
    draft.record?.state === "REJECTED" ? draft.record.error : null;
  const items = itemsOf(view, payload);
  const { counted, total } = progressOf(view, payload);
  const left = uncountedLines(view, payload);
  const done = (item: ItemView) =>
    item.state === "DONE" || item.state === "LOCKED";
  const needle = toSearchText(q);
  const shownItems = items.filter(
    (item) =>
      (tab === "all" || (tab === "done") === done(item)) &&
      (needle === "" ||
        toSearchText(`${item.itemCode} ${item.itemName}`).includes(needle)),
  );
  const todoCount = items.filter((item) => !done(item)).length;

  const change = (
    next: (current: StocktakeDraftPayload) => StocktakeDraftPayload,
  ) => draft.update((current) => next(alignDraft(current, view)));

  const setCount = (
    itemId: string,
    update: (
      count: StocktakeDraftPayload["counts"][string],
    ) => StocktakeDraftPayload["counts"][string],
  ) =>
    change((current) => {
      const base = current.counts[itemId] ?? {
        startedAt: nowIso(),
        countedAt: null,
        values: {},
      };
      return {
        ...current,
        counts: { ...current.counts, [itemId]: update(base) },
        body: null,
      };
    });

  function startItem(item: ItemView) {
    setCount(item.itemId, () => ({
      startedAt: nowIso(),
      countedAt: null,
      values: {},
    }));
  }

  function editItem(item: ItemView) {
    const values: Partial<Record<Condition, string>> = {};
    for (const condition of item.conditions) {
      const typed = payload.counts[item.itemId]?.values[condition];
      const server = item.server[condition];
      if (typed !== undefined) values[condition] = typed;
      else if (server !== undefined) {
        values[condition] = inputText(server, item.unit);
      }
    }
    setCount(item.itemId, () => ({
      startedAt: nowIso(),
      countedAt: null,
      values,
    }));
  }

  function finishItem(item: ItemView) {
    const error = finishError(item, payload.counts[item.itemId], recountRound);
    setErrors((current) => {
      const next = { ...current };
      if (error) next[item.itemId] = error;
      else delete next[item.itemId];
      return next;
    });
    if (error) return;
    setCount(item.itemId, (count) => ({ ...count, countedAt: nowIso() }));
  }

  function addCondition(item: ItemView, condition: Condition) {
    change((current) => ({
      ...current,
      extraConditions: {
        ...current.extraConditions,
        [item.itemId]: [
          ...(current.extraConditions[item.itemId] ?? []),
          condition,
        ],
      },
      body: null,
    }));
  }

  function picked(found: CatalogItem) {
    const known = items.find((item) => item.itemId === found.itemId);
    if (!known) {
      change((current) => ({
        ...current,
        added: [...current.added, found],
        extraConditions: {
          ...current.extraConditions,
          [found.itemId]: ["GOOD"],
        },
        counts: {
          ...current.counts,
          [found.itemId]: { startedAt: nowIso(), countedAt: null, values: {} },
        },
        body: null,
      }));
    }
    setTab("all");
    setQ("");
    requestAnimationFrame(() =>
      cards.current
        .get(found.itemId)
        ?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  }

  async function send() {
    if (counted === 0) {
      setMessage(STOCKTAKE_MESSAGES.nothingCounted);
      return;
    }
    const items = toSubmitItems(view, payload);
    const recountLeft = view.lines.filter(
      (line) =>
        line.recount &&
        !items.some(
          (item) =>
            item.itemId === line.itemId &&
            item.lines.some((sent) => sent.condition === line.condition),
        ),
    ).length;
    if (recountLeft > 0) {
      setMessage(STOCKTAKE_MESSAGES.recountMissing(recountLeft));
      return;
    }
    setMessage(null);
    const body = { items };
    const saved = await draft.saveNow({
      payload: { ...payload, body },
      state: "QUEUED",
    });
    const outcome = await outboxFor(userId).submit(saved.draftId);
    if (outcome.kind === "POSTED") {
      // This page says it; the shell banner is for background sends.
      postedNotices.clear();
      router.refresh();
    } else if (outcome.kind === "REJECTED") {
      router.refresh();
    } else if (outcome.kind === "SIGNED_OUT") {
      setMessage(STOCKTAKE_COUNT_MESSAGES.signedOut);
    } else if (outcome.kind === "RETRY") {
      setMessage(STOCKTAKE_COUNT_MESSAGES.queued);
    }
  }

  async function cancel(reason: string): Promise<boolean> {
    setCancelling(true);
    setCancelError(null);
    const result = await callApi(
      `/api/stocktakes/${encodeURIComponent(view.code)}/cancel`,
      { method: "POST", body: { reason } },
    );
    setCancelling(false);
    if (!result.ok) {
      setCancelError(result.error);
      return false;
    }
    await draft.remove();
    router.push("/m");
    return true;
  }

  if (!draft.ready) {
    return <p className="text-body text-muted-foreground">Đang mở phiên…</p>;
  }

  const scope = view.scope ? `Nhóm: ${view.scope.join(", ")}. ` : "";
  return (
    <div className="flex flex-col gap-5 pb-44">
      <section className="flex flex-col gap-1">
        <h2 className="font-display text-h2">Kiểm kê {view.code}</h2>
        <p data-mask className="text-label text-muted-foreground">
          {view.locationCode} · {view.locationName} · bắt đầu{" "}
          {formatDateTime(new Date(view.startedAt)).slice(11)}{" "}
          {formatDateTime(new Date(view.startedAt)).slice(0, 5)}
        </p>
      </section>

      {view.returnedReason && (
        <p
          role="status"
          className="rounded-lg border-2 border-warning bg-card p-4 text-label"
        >
          Văn phòng trả lại: {view.returnedReason}
        </p>
      )}
      {recountRound && (
        <p
          role="status"
          className="rounded-lg border-2 border-warning bg-card p-4 text-label"
        >
          Văn phòng yêu cầu đếm lại{" "}
          {view.lines.filter((line) => line.recount).length} dòng.
        </p>
      )}

      <section
        aria-labelledby="progress-title"
        className="flex flex-col gap-2 rounded-lg border bg-card p-4"
      >
        <div className="flex items-baseline justify-between">
          <h3 id="progress-title" className="text-label">
            Đã đếm
          </h3>
          <span className="text-h3 font-display tabular-nums">
            <span data-mask>
              {counted} / {total}
            </span>{" "}
            dòng
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Tiến độ kiểm kê"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={counted}
          className="h-2 overflow-hidden rounded-pill bg-muted"
        >
          <div
            className="h-full bg-primary"
            style={{ width: `${total ? (counted * 100) / total : 0}%` }}
          />
        </div>
        <p className="text-caption text-muted-foreground">
          {scope}Nháp tự lưu trên máy, mất sóng vẫn đếm được.
        </p>
      </section>

      {(queued || message || rejected) && (
        <p
          role="status"
          className="rounded-lg border-2 border-warning bg-card p-4 text-label"
        >
          {rejected ?? message ?? STOCKTAKE_COUNT_MESSAGES.queued}
        </p>
      )}

      <div className="flex gap-2">
        <label className="flex h-12 flex-1 items-center gap-2 rounded-md border bg-card px-3">
          <Search aria-hidden className="size-5 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Tìm mã hoặc tên hàng"
            placeholder="Tìm mã hoặc tên hàng"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          aria-label="Quét mã QR"
          disabled={locked}
          onClick={() => setAdding("scan")}
        >
          <ScanLine aria-hidden className="size-5" />
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Lọc dòng"
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
      >
        {(
          [
            ["todo", `Chưa đếm (${todoCount})`],
            ["done", `Đã đếm (${items.length - todoCount})`],
            ["all", "Tất cả"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "h-11 rounded-md text-label",
              tab === key ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <section
        aria-label="Danh sách mã cần đếm"
        className="flex flex-col gap-3"
      >
        {shownItems.map((item) => (
          <CountItemCard
            key={item.itemId}
            ref={(node) => {
              if (node) cards.current.set(item.itemId, node);
              else cards.current.delete(item.itemId);
            }}
            item={item}
            count={payload.counts[item.itemId]}
            required={requiredConditions(item, recountRound)}
            disabled={locked}
            error={errors[item.itemId] ?? null}
            onStart={() => startItem(item)}
            onValue={(condition, text) =>
              setCount(item.itemId, (count) => ({
                ...count,
                values: { ...count.values, [condition]: text },
              }))
            }
            onAddCondition={(condition) => addCondition(item, condition)}
            onFinish={() => finishItem(item)}
            onEdit={() => editItem(item)}
          />
        ))}
        {shownItems.length === 0 && (
          <p className="rounded-lg border bg-card p-4 text-body text-muted-foreground">
            Không có mã nào ở mục này.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-12"
          disabled={locked}
          onClick={() => setAdding("search")}
        >
          <Plus aria-hidden /> Thấy hàng không có trong danh sách
        </Button>
        {canCancel && (
          <ReasonDialog
            trigger={
              <Button
                type="button"
                variant="ghost"
                className="h-11 self-start text-destructive"
              >
                Hủy phiên
              </Button>
            }
            title={`Hủy ${view.code}?`}
            description="Phiên đã hủy không ghi gì vào sổ kho. Số đã đếm trên máy sẽ bị xóa."
            label="Lý do hủy"
            confirmLabel="Hủy phiên"
            destructive
            pending={cancelling}
            error={cancelError}
            onConfirm={cancel}
          />
        )}
      </section>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t bg-card">
        <div className="mx-auto flex max-w-[640px] flex-col gap-2 px-4 py-3">
          {left > 0 && (
            <p id="send-hint" className="text-caption text-muted-foreground">
              {STOCKTAKE_COUNT_MESSAGES.uncounted(left)}
            </p>
          )}
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
              Tạm dừng
            </Button>
            {left > 0 ? (
              <ConfirmAction
                trigger={
                  <Button
                    type="button"
                    className="h-12"
                    disabled={locked}
                    aria-describedby="send-hint"
                  >
                    Gửi văn phòng
                  </Button>
                }
                title={`Gửi ${view.code} về văn phòng?`}
                description={STOCKTAKE_COUNT_MESSAGES.uncounted(left)}
                confirmLabel="Gửi luôn"
                onConfirm={async () => {
                  await send();
                  return true;
                }}
              />
            ) : (
              <Button
                type="button"
                className="h-12"
                disabled={locked}
                onClick={() => void send()}
              >
                Gửi văn phòng
              </Button>
            )}
          </div>
        </div>
      </div>

      <AddItemSheet
        open={adding !== null}
        scanFirst={adding === "scan"}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
        onPick={picked}
      />
    </div>
  );
}
