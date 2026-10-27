import { describe, expect, it, vi } from "vitest";

import {
  createOutbox,
  nextRetryDelay,
  receiptSender,
  type SendOutcome,
  type Sender,
} from "./outbox";
import { isStale, memoryDraftStore, type DraftRecord } from "./store";

const NOW = new Date("2026-10-26T01:15:00Z");

function draft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    draftId: "7f3c0000-0000-4000-8000-000000000001",
    kind: "GOODS_RECEIPT",
    userId: "vantung",
    documentRef: "PO-2026-052",
    title: "Nhập PO-2026-052 · anh Trần Văn Hùng",
    progress: "2/4 mã đã đếm",
    payload: { body: { orderCode: "PO-2026-052", lines: [] } },
    state: "QUEUED",
    error: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    attempts: 0,
    ...overrides,
  };
}

describe("memoryDraftStore", () => {
  it("saves, reads back and lists only the owner's drafts, newest first", async () => {
    const store = memoryDraftStore();
    await store.put(draft());
    await store.put(
      draft({
        draftId: "b",
        updatedAt: "2026-10-26T02:00:00.000Z",
      }),
    );
    await store.put(draft({ draftId: "c", userId: "ducthang" }));
    expect((await store.get(draft().draftId))?.progress).toBe("2/4 mã đã đếm");
    expect((await store.list("vantung")).map((row) => row.draftId)).toEqual([
      "b",
      draft().draftId,
    ]);
    expect((await store.list("ducthang")).map((row) => row.draftId)).toEqual([
      "c",
    ]);
    await store.remove("b");
    expect(await store.get("b")).toBeNull();
  });

  it("calls a draft older than 3 days stale", () => {
    const record = draft({ createdAt: "2026-10-26T01:15:00Z" });
    expect(isStale(record, new Date("2026-10-29T01:00:00Z"))).toBe(false);
    expect(isStale(record, new Date("2026-10-30T01:00:00Z"))).toBe(true);
  });
});

function setup(outcomes: SendOutcome[]) {
  const store = memoryDraftStore();
  const sent: DraftRecord[] = [];
  const send: Sender = async (record) => {
    sent.push(record);
    return outcomes.shift() ?? { kind: "RETRY" };
  };
  const onPosted = vi.fn();
  const onRejected = vi.fn();
  const outbox = createOutbox({
    store,
    userId: "vantung",
    send,
    now: () => NOW,
    onPosted,
    onRejected,
  });
  return { store, sent, outbox, onPosted, onRejected };
}

describe("outbox", () => {
  it("keeps a draft queued when the network is down and resends the same draft id", async () => {
    const { store, sent, outbox, onPosted } = setup([
      { kind: "RETRY" },
      { kind: "POSTED", code: "PN-2026-094" },
    ]);
    await store.put(draft());
    expect(await outbox.submit(draft().draftId)).toEqual({ kind: "RETRY" });
    expect((await store.get(draft().draftId))?.state).toBe("QUEUED");
    await outbox.flush();
    expect(sent.map((record) => record.draftId)).toEqual([
      draft().draftId,
      draft().draftId,
    ]);
    expect(sent[1]?.attempts).toBe(2);
    expect(await store.get(draft().draftId)).toBeNull();
    expect(onPosted).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: draft().draftId }),
      "PN-2026-094",
    );
  });

  it("marks a refused draft rejected and keeps what was counted", async () => {
    const { store, outbox, onRejected } = setup([
      {
        kind: "REJECTED",
        error: "Đơn PO-2026-051 đã xong, không nhập thêm được",
        field: null,
      },
    ]);
    await store.put(draft());
    await outbox.submit(draft().draftId);
    expect(await store.get(draft().draftId)).toMatchObject({
      state: "REJECTED",
      error: "Đơn PO-2026-051 đã xong, không nhập thêm được",
      payload: draft().payload,
    });
    expect(onRejected).toHaveBeenCalled();
  });

  it("keeps a draft queued when signed out", async () => {
    const { store, outbox } = setup([{ kind: "SIGNED_OUT" }]);
    await store.put(draft());
    await outbox.submit(draft().draftId);
    expect((await store.get(draft().draftId))?.state).toBe("QUEUED");
  });

  it("sends only once when confirm is pressed twice", async () => {
    let release: (outcome: SendOutcome) => void = () => undefined;
    const store = memoryDraftStore();
    const send = vi.fn<Sender>(
      () => new Promise<SendOutcome>((resolve) => (release = resolve)),
    );
    const outbox = createOutbox({ store, userId: "vantung", send });
    await store.put(draft());
    const first = outbox.submit(draft().draftId);
    const second = await outbox.submit(draft().draftId);
    expect(second).toEqual({ kind: "BUSY" });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    release({ kind: "POSTED", code: "PN-2026-094" });
    expect(await first).toEqual({ kind: "POSTED", code: "PN-2026-094" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("flushes queued drafts only, picking up one a closed tab left sending", async () => {
    const { store, sent, outbox } = setup([
      { kind: "POSTED", code: "PN-1" },
      { kind: "POSTED", code: "PN-2" },
    ]);
    await store.put(draft({ draftId: "editing", state: "EDITING" }));
    await store.put(draft({ draftId: "queued" }));
    await store.put(draft({ draftId: "stuck", state: "SENDING" }));
    await store.put(draft({ draftId: "other", userId: "ducthang" }));
    await outbox.flush();
    expect(sent.map((record) => record.draftId).sort()).toEqual([
      "queued",
      "stuck",
    ]);
  });

  it("backs off from 30 seconds to 5 minutes and resets after a success", () => {
    expect(nextRetryDelay(30_000, [{ kind: "RETRY" }])).toBe(60_000);
    expect(nextRetryDelay(240_000, [{ kind: "RETRY" }])).toBe(300_000);
    expect(nextRetryDelay(300_000, [{ kind: "POSTED", code: "x" }])).toBe(
      30_000,
    );
  });
});

describe("receiptSender", () => {
  const reply = (status: number, body: unknown) =>
    vi.fn<typeof fetch>(async () => Response.json(body, { status }));

  it("posts the body with the draft id", async () => {
    const fetcher = reply(201, { data: { code: "PN-2026-094" } });
    expect(await receiptSender(fetcher)(draft())).toEqual({
      kind: "POSTED",
      code: "PN-2026-094",
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("/api/receiving/receipts");
    expect(JSON.parse(String(init?.body))).toEqual({
      orderCode: "PO-2026-052",
      lines: [],
      draftId: draft().draftId,
    });
  });

  it("maps answers to outcomes", async () => {
    const network = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await receiptSender(network)(draft())).toEqual({ kind: "RETRY" });
    expect(await receiptSender(reply(503, {}))(draft())).toEqual({
      kind: "RETRY",
    });
    expect(await receiptSender(reply(401, {}))(draft())).toEqual({
      kind: "SIGNED_OUT",
    });
    expect(
      await receiptSender(
        reply(422, {
          error: "Nhận 2.000 cái, đơn chỉ còn 200. Đúng không?",
          data: { field: "lines.0.quantity" },
        }),
      )(draft()),
    ).toEqual({
      kind: "REJECTED",
      error: "Nhận 2.000 cái, đơn chỉ còn 200. Đúng không?",
      field: "lines.0.quantity",
    });
  });
});

describe("draft runtime", () => {
  it("knows while a page holds a draft", async () => {
    const { draftPresence, resetDraftRuntime } = await import("./runtime");
    resetDraftRuntime();
    const seen: boolean[] = [];
    const stop = draftPresence.subscribe(() =>
      seen.push(draftPresence.current()),
    );
    const leave = draftPresence.enter();
    expect(draftPresence.current()).toBe(true);
    leave();
    stop();
    expect(seen).toEqual([true, false]);
  });

  it("keeps one outbox per user and reports what it posted", async () => {
    const { outboxFor, postedNotices, resetDraftRuntime, draftsChanged } =
      await import("./runtime");
    const { setDraftStore } = await import("./store");
    resetDraftRuntime();
    const store = memoryDraftStore();
    setDraftStore(store);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ data: { code: "PN-2026-094" } }, { status: 201 }),
      ),
    );
    const changed = vi.fn();
    const stop = draftsChanged.subscribe(changed);
    expect(outboxFor("vantung")).toBe(outboxFor("vantung"));
    await store.put(draft());
    await outboxFor("vantung").submit(draft().draftId);
    expect(postedNotices.current()).toEqual({
      title: draft().title,
      code: "PN-2026-094",
    });
    expect(changed).toHaveBeenCalled();
    postedNotices.clear();
    expect(postedNotices.current()).toBeNull();
    stop();
    vi.unstubAllGlobals();
    setDraftStore(null);
  });
});
