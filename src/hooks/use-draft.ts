"use client";

// A document worked on in a phone draft (goods-receipt design D1, spec
// mobile-drafts): opens the draft (or makes one), saves every change after
// 500 ms, and locks it while it is queued or being sent.
import { useCallback, useEffect, useRef, useState } from "react";

import {
  askPersistentStorage,
  draftStore,
  type DraftKind,
  type DraftRecord,
} from "@/lib/drafts/store";
import { draftPresence, draftsChanged } from "@/lib/drafts/runtime";

export const AUTOSAVE_MS = 500;

export interface UseDraftOptions<P> {
  kind: DraftKind;
  userId: string;
  documentRef: string;
  title: string;
  /** Open this draft; without it the user's newest draft of documentRef. */
  draftId?: string | null;
  /**
   * The document's updatedAt on the server. A draft being edited for another
   * version is dropped and opened anew from the server's numbers; one already
   * queued stays, so the server can answer it with 409.
   */
  version?: string;
  /** The payload of a new draft. */
  initial: () => P;
  /** "2/4 mã đã đếm", worked out from the payload. */
  progressOf: (payload: P) => string;
}

export interface UseDraft<P> {
  ready: boolean;
  record: DraftRecord<P> | null;
  payload: P;
  /** False while queued or sending: the form must not change. */
  editable: boolean;
  /** True when a draft of an older version was dropped on opening. */
  reopened: boolean;
  update: (next: P | ((current: P) => P)) => void;
  /** Writes right away (Lưu nháp, before sending). */
  saveNow: (patch?: Partial<DraftRecord<P>>) => Promise<DraftRecord<P>>;
  remove: () => Promise<void>;
}

const newDraftId = () => crypto.randomUUID();

/** Queued and sending drafts are left for the server to refuse. */
function isOutdated(draft: DraftRecord, version: string | undefined): boolean {
  return (
    version !== undefined &&
    draft.version !== version &&
    (draft.state === "EDITING" || draft.state === "REJECTED")
  );
}

export function useDraft<P>(options: UseDraftOptions<P>): UseDraft<P> {
  const { kind, userId, documentRef, title, draftId, version } = options;
  const initial = useRef(options.initial);
  const progressOf = useRef(options.progressOf);
  useEffect(() => {
    initial.current = options.initial;
    progressOf.current = options.progressOf;
  });
  const [fallback] = useState(options.initial);
  const [record, setRecord] = useState<DraftRecord<P> | null>(null);
  const [reopened, setReopened] = useState(false);
  const latest = useRef<DraftRecord<P> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => draftPresence.enter(), []);

  useEffect(() => {
    let alive = true;
    const store = draftStore();
    // The page got a newer document: typing not saved yet belongs to the old.
    const dropOldTyping = () => {
      const pending = timer.current;
      if (!pending || !latest.current) return false;
      if (!isOutdated(latest.current, version)) return false;
      clearTimeout(pending);
      timer.current = null;
      return true;
    };
    const dropsTyping = dropOldTyping();
    void (async () => {
      const found = draftId
        ? await store.get(draftId)
        : (await store.list(userId)).find(
            (row) => row.kind === kind && row.documentRef === documentRef,
          );
      if (!alive) return;
      const mine = found && found.userId === userId ? found : null;
      const outdated = mine !== null && isOutdated(mine, version);
      if (outdated) {
        await store.remove(mine.draftId);
        draftsChanged.emit();
        if (!alive) return;
      }
      // Typed while the store was being read: it must not write the old back.
      const dropsLateTyping = dropOldTyping();
      const now = new Date().toISOString();
      const opened: DraftRecord<P> =
        mine && !outdated
          ? (mine as DraftRecord<P>)
          : {
              draftId: draftId ?? newDraftId(),
              kind,
              userId,
              documentRef,
              title,
              progress: progressOf.current(initial.current()),
              payload: initial.current(),
              state: "EDITING",
              error: null,
              createdAt: now,
              updatedAt: now,
              attempts: 0,
              ...(version === undefined ? {} : { version }),
            };
      latest.current = opened;
      setRecord(opened);
      setReopened(outdated || dropsTyping || dropsLateTyping);
    })();
    return () => {
      alive = false;
    };
  }, [kind, userId, documentRef, title, draftId, version]);

  const cancelTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const write = useCallback(async (next: DraftRecord<P>) => {
    askPersistentStorage();
    await draftStore().put(next);
    draftsChanged.emit();
  }, []);

  const saveNow = useCallback(
    async (patch: Partial<DraftRecord<P>> = {}) => {
      cancelTimer();
      const base = latest.current;
      if (!base) throw new Error("draft not opened yet");
      const next: DraftRecord<P> = {
        ...base,
        ...patch,
        progress: progressOf.current(patch.payload ?? base.payload),
        updatedAt: new Date().toISOString(),
      };
      latest.current = next;
      setRecord(next);
      await write(next);
      return next;
    },
    [write, cancelTimer],
  );

  const update = useCallback(
    (value: P | ((current: P) => P)) => {
      const base = latest.current;
      if (!base || (base.state !== "EDITING" && base.state !== "REJECTED")) {
        return;
      }
      const payload =
        typeof value === "function"
          ? (value as (current: P) => P)(base.payload)
          : value;
      const next: DraftRecord<P> = {
        ...base,
        payload,
        state: "EDITING",
        progress: progressOf.current(payload),
        updatedAt: new Date().toISOString(),
      };
      latest.current = next;
      setRecord(next);
      cancelTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        void write(next);
      }, AUTOSAVE_MS);
    },
    [write, cancelTimer],
  );

  const remove = useCallback(async () => {
    cancelTimer();
    if (latest.current) await draftStore().remove(latest.current.draftId);
    draftsChanged.emit();
  }, [cancelTimer]);

  // Leaving the page writes a change still waiting for its 500 ms.
  useEffect(
    () => () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      if (latest.current) void write(latest.current);
    },
    [write],
  );

  const ready = record !== null;
  return {
    ready,
    record,
    payload: record?.payload ?? fallback,
    editable:
      ready && (record.state === "EDITING" || record.state === "REJECTED"),
    reopened,
    update,
    saveNow,
    remove,
  };
}
