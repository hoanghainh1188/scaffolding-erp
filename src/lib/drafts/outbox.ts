// Sends confirmed drafts (goods-receipt design D1, stocktake design D8).
// Every send of a draft carries the same draft id, so the server returns
// the document it already made instead of making a second one. One send per draft at a time, also
// across tabs when the browser has Web Locks.
import type { DraftRecord, DraftStore } from "./store";

export type SendOutcome =
  | { kind: "POSTED"; code: string }
  /** No network or a server error: try again later. */
  | { kind: "RETRY" }
  /** 401: keep the draft until the user signs in again. */
  | { kind: "SIGNED_OUT" }
  /** 409/422: the user must look at it. */
  | { kind: "REJECTED"; error: string; field: string | null }
  /** Another send of this draft is in flight. */
  | { kind: "BUSY" };

export type Sender = (record: DraftRecord) => Promise<SendOutcome>;

const RECEIPTS_URL = "/api/receiving/receipts";

async function postJson(
  fetcher: typeof fetch,
  url: string,
  body: object,
): Promise<SendOutcome> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "RETRY" };
  }
  return outcomeOf(response);
}

async function outcomeOf(response: Response): Promise<SendOutcome> {
  if (response.status === 401) return { kind: "SIGNED_OUT" };
  if (response.status >= 500) return { kind: "RETRY" };
  const json = (await response.json().catch(() => null)) as {
    data?: { code?: string; field?: string } | null;
    error?: string | null;
  } | null;
  if (response.ok && json?.data?.code) {
    return { kind: "POSTED", code: json.data.code };
  }
  return {
    kind: "REJECTED",
    error: json?.error ?? "Gửi phiếu không được, thử lại sau",
    field: json?.data?.field ?? null,
  };
}

/** The body a goods receipt draft sends: its payload's `body` + draft id. */
export function receiptSender(fetcher: typeof fetch = fetch): Sender {
  return (record) => {
    const payload = record.payload as { body?: object } | null;
    return postJson(fetcher, RECEIPTS_URL, {
      ...payload?.body,
      draftId: record.draftId,
    });
  };
}

/**
 * A stocktake count: the draft id is the submission id, and the phone's
 * clock goes along so the server can correct the count times (D3).
 */
export function stocktakeSender(
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Sender {
  return (record) => {
    const payload = record.payload as { body?: object } | null;
    return postJson(
      fetcher,
      `/api/stocktakes/${encodeURIComponent(record.documentRef)}/submit`,
      {
        ...payload?.body,
        submissionId: record.draftId,
        deviceNow: now().toISOString(),
      },
    );
  };
}

/**
 * "Xác nhận xe rời bãi" (deliveries design D13): the draft id goes as the
 * client draft id, so a resend answers with the note already posted.
 */
export function deliverySender(fetcher: typeof fetch = fetch): Sender {
  return (record) => {
    const payload = record.payload as { body?: object } | null;
    return postJson(
      fetcher,
      `/api/m/deliveries/${encodeURIComponent(record.documentRef)}/post`,
      { ...payload?.body, clientDraftId: record.draftId },
    );
  };
}

/** Picks the sender of the draft's kind. */
export function draftSender(fetcher: typeof fetch = fetch): Sender {
  const receipt = receiptSender(fetcher);
  const stocktake = stocktakeSender(fetcher);
  const delivery = deliverySender(fetcher);
  return (record) =>
    record.kind === "STOCKTAKE"
      ? stocktake(record)
      : record.kind === "DELIVERY"
        ? delivery(record)
        : receipt(record);
}

/** Drafts this tab is sending now. */
const inFlight = new Set<string>();

async function exclusive<T>(
  draftId: string,
  body: () => Promise<T>,
  busy: T,
): Promise<T> {
  if (inFlight.has(draftId)) return busy;
  inFlight.add(draftId);
  try {
    const locks =
      typeof navigator === "undefined" ? undefined : navigator.locks;
    if (!locks) return await body();
    return await locks.request(
      `draft:${draftId}`,
      { ifAvailable: true },
      async (lock) => (lock ? body() : busy),
    );
  } finally {
    inFlight.delete(draftId);
  }
}

export interface OutboxOptions {
  store: DraftStore;
  userId: string;
  send: Sender;
  now?: () => Date;
  onPosted?: (record: DraftRecord, code: string) => void;
  onRejected?: (record: DraftRecord, error: string) => void;
}

export interface Outbox {
  /** Confirms a draft and sends it once (the "Xác nhận" button). */
  submit(draftId: string): Promise<SendOutcome>;
  /** Sends every queued draft of the user, one after the other. */
  flush(): Promise<SendOutcome[]>;
}

export function createOutbox(options: OutboxOptions): Outbox {
  const { store, userId, send } = options;
  const now = options.now ?? (() => new Date());

  async function sendOne(draftId: string): Promise<SendOutcome> {
    return exclusive<SendOutcome>(
      draftId,
      async () => {
        const record = await store.get(draftId);
        if (!record || record.userId !== userId) return { kind: "BUSY" };
        const sending: DraftRecord = {
          ...record,
          state: "SENDING",
          error: null,
          attempts: record.attempts + 1,
          updatedAt: now().toISOString(),
        };
        await store.put(sending);
        let outcome: SendOutcome;
        try {
          outcome = await send(sending);
        } catch {
          outcome = { kind: "RETRY" };
        }
        if (outcome.kind === "POSTED") {
          await store.remove(draftId);
          options.onPosted?.(sending, outcome.code);
        } else if (outcome.kind === "REJECTED") {
          await store.put({
            ...sending,
            state: "REJECTED",
            error: outcome.error,
          });
          options.onRejected?.(sending, outcome.error);
        } else {
          await store.put({ ...sending, state: "QUEUED" });
        }
        return outcome;
      },
      { kind: "BUSY" },
    );
  }

  return {
    submit: sendOne,
    async flush() {
      const outcomes: SendOutcome[] = [];
      for (const record of await store.list(userId)) {
        // A SENDING row left by a closed tab is queued again.
        if (record.state !== "QUEUED" && record.state !== "SENDING") continue;
        outcomes.push(await sendOne(record.draftId));
      }
      return outcomes;
    },
  };
}

/** Retry pause: 30 s doubling to 5 minutes; back to 30 s after a success. */
export const RETRY_BASE_MS = 30_000;
export const RETRY_MAX_MS = 300_000;

export function nextRetryDelay(
  previous: number,
  outcomes: readonly SendOutcome[],
): number {
  if (outcomes.some((outcome) => outcome.kind === "RETRY")) {
    return Math.min(Math.max(previous * 2, RETRY_BASE_MS), RETRY_MAX_MS);
  }
  return RETRY_BASE_MS;
}
