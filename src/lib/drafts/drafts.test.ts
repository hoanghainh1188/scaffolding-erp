import { describe, expect, it, vi } from "vitest";

import {
  createOutbox,
  deliverySender,
  nextRetryDelay,
  draftSender,
  receiptSender,
  returnSender,
  stocktakeSender,
  type ReturnDraftPayload,
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
      kind: "GOODS_RECEIPT",
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

describe("stocktakeSender", () => {
  const stocktakeDraft = () =>
    draft({
      draftId: "5a1e0000-0000-4000-8000-000000000003",
      kind: "STOCKTAKE",
      documentRef: "KK-2026-003",
      title: "Kiểm kê KK-2026-003 · BAI-01",
      payload: { round: 1, body: { items: [{ itemId: "x" }] } },
    });

  it("posts the count with the draft id as submission id and the phone clock", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ data: { code: "KK-2026-003" } }),
    );
    expect(await stocktakeSender(fetcher, () => NOW)(stocktakeDraft())).toEqual(
      { kind: "POSTED", code: "KK-2026-003" },
    );
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("/api/stocktakes/KK-2026-003/submit");
    expect(JSON.parse(String(init?.body))).toEqual({
      items: [{ itemId: "x" }],
      submissionId: stocktakeDraft().draftId,
      deviceNow: NOW.toISOString(),
    });
  });

  it("is picked by the draft kind", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ data: { code: "OK" } }),
    );
    const send = draftSender(fetcher);
    await send(stocktakeDraft());
    await send(draft());
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/stocktakes/KK-2026-003/submit",
      "/api/receiving/receipts",
    ]);
  });

  it("sends a stocktake count once when Gửi is pressed twice", async () => {
    let release: (response: Response) => void = () => undefined;
    const fetcher = vi.fn<typeof fetch>(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const store = memoryDraftStore();
    const outbox = createOutbox({
      store,
      userId: "vantung",
      send: stocktakeSender(fetcher),
    });
    await store.put(stocktakeDraft());
    const first = outbox.submit(stocktakeDraft().draftId);
    expect(await outbox.submit(stocktakeDraft().draftId)).toEqual({
      kind: "BUSY",
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    release(Response.json({ data: { code: "KK-2026-003" } }));
    expect(await first).toEqual({ kind: "POSTED", code: "KK-2026-003" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("deliverySender", () => {
  const deliveryDraft = (overrides: Partial<DraftRecord> = {}) =>
    draft({
      draftId: "9b2e0000-0000-4000-8000-000000000004",
      kind: "DELIVERY",
      documentRef: "PX-2026-140",
      title: "Xuất PX-2026-140 · An Phú – Block B",
      progress: "200 / 300 cái",
      payload: {
        body: {
          startedVersion: "2026-11-03T02:40:00.000Z",
          vehiclePlate: "51X-000.01",
          picks: [{ lineId: "l1", condition: "GOOD", quantity: "120" }],
        },
      },
      ...overrides,
    });

  it("posts the picks with the draft id as client draft id", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ data: { code: "PX-2026-140" } }, { status: 201 }),
    );
    expect(await deliverySender(fetcher)(deliveryDraft())).toEqual({
      kind: "POSTED",
      code: "PX-2026-140",
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("/api/m/deliveries/PX-2026-140/post");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      clientDraftId: deliveryDraft().draftId,
      startedVersion: "2026-11-03T02:40:00.000Z",
      vehiclePlate: "51X-000.01",
    });
  });

  it("keeps the picks when the office changed the note (409)", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          data: null,
          error:
            "Văn phòng đã đổi phiếu PX-2026-140 sau khi bạn bắt đầu nhặt. Bạn mở lại phiếu để nhặt theo số mới.",
        },
        { status: 409 },
      ),
    );
    const store = memoryDraftStore();
    const outbox = createOutbox({
      store,
      userId: "vantung",
      send: draftSender(fetcher),
    });
    await store.put(deliveryDraft());
    expect(await outbox.submit(deliveryDraft().draftId)).toMatchObject({
      kind: "REJECTED",
    });
    const kept = await store.get(deliveryDraft().draftId);
    expect(kept?.state).toBe("REJECTED");
    expect(kept?.payload).toEqual(deliveryDraft().payload);
  });

  it("stays queued when offline and when signed out", async () => {
    const store = memoryDraftStore();
    const offline = createOutbox({
      store,
      userId: "vantung",
      send: deliverySender(
        vi.fn<typeof fetch>(async () => {
          throw new TypeError("offline");
        }),
      ),
    });
    await store.put(deliveryDraft());
    expect(await offline.submit(deliveryDraft().draftId)).toEqual({
      kind: "RETRY",
    });
    expect((await store.get(deliveryDraft().draftId))?.state).toBe("QUEUED");
    const signedOut = createOutbox({
      store,
      userId: "vantung",
      send: deliverySender(
        vi.fn<typeof fetch>(async () => new Response(null, { status: 401 })),
      ),
    });
    expect(await signedOut.submit(deliveryDraft().draftId)).toEqual({
      kind: "SIGNED_OUT",
    });
    expect((await store.get(deliveryDraft().draftId))?.state).toBe("QUEUED");
  });
});

describe("returnSender", () => {
  const photo = (index: number, uploadedId: string | null = null) => ({
    clientPhotoId: `00000000-0000-4000-8000-00000000000${index}`,
    caption: `Ảnh ${index}`,
    blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, index])]),
    uploadedId,
  });

  function returnDraft(photos: ReturnType<typeof photo>[]): DraftRecord {
    return draft({
      kind: "RETURN",
      documentRef: "112026/ANPHAT-MINHPHAT",
      title: "Thu hồi An Phú – Block B",
      payload: {
        body: { contractId: "c1", yardLocationId: "y1", lines: [] },
        photos,
      },
    });
  }

  /** A server that names each photo and posts the note. */
  function server(
    options: { photoFails?: number; expiredOnce?: string[] } = {},
  ) {
    let failures = options.photoFails ?? Infinity;
    let expired = options.expiredOnce ?? [];
    const photos: string[] = [];
    const posts: unknown[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/photos")) {
        if (photos.length >= failures) {
          failures = Infinity;
          throw new TypeError("offline");
        }
        const form = init?.body as FormData;
        const id = `srv-${String(form.get("clientPhotoId")).slice(-1)}`;
        photos.push(id);
        return Response.json({ data: { id } }, { status: 201 });
      }
      const body = JSON.parse(String(init?.body)) as { photoIds: string[] };
      posts.push(body);
      if (expired.length > 0) {
        const gone = expired;
        expired = [];
        return Response.json(
          { data: { code: "PHOTOS_EXPIRED", expiredPhotoIds: gone } },
          { status: 422 },
        );
      }
      return Response.json({ data: { code: "PTH-2026-071" } }, { status: 201 });
    });
    return { fetcher, photos, posts };
  }

  it("sends the photos, then the note with their ids", async () => {
    const store = memoryDraftStore();
    const record = returnDraft([photo(1), photo(2)]);
    await store.put(record);
    const api = server();
    expect(await returnSender(store, api.fetcher)(record)).toEqual({
      kind: "POSTED",
      code: "PTH-2026-071",
    });
    expect(api.posts[0]).toMatchObject({
      clientDraftId: record.draftId,
      photoIds: ["srv-1", "srv-2"],
    });
  });

  it("resends only the photos the server has not got", async () => {
    const store = memoryDraftStore();
    const record = returnDraft([photo(1), photo(2), photo(3), photo(4)]);
    await store.put(record);
    const api = server({ photoFails: 2 });
    const outbox = createOutbox({
      store,
      userId: "vantung",
      send: returnSender(store, api.fetcher),
    });
    expect(await outbox.submit(record.draftId)).toEqual({ kind: "RETRY" });
    const kept = await store.get(record.draftId);
    expect(kept?.state).toBe("QUEUED");
    expect(
      (kept?.payload as ReturnDraftPayload).photos.map((p) => p.uploadedId),
    ).toEqual(["srv-1", "srv-2", null, null]);
    expect(await outbox.submit(record.draftId)).toMatchObject({
      kind: "POSTED",
    });
    expect(api.photos).toEqual(["srv-1", "srv-2", "srv-3", "srv-4"]);
  });

  it("sends expired photos again from the draft, without a rejection", async () => {
    const store = memoryDraftStore();
    const record = returnDraft([photo(1, "srv-1"), photo(2, "old-2")]);
    await store.put(record);
    const api = server({ expiredOnce: ["old-2"] });
    expect(await returnSender(store, api.fetcher)(record)).toMatchObject({
      kind: "POSTED",
    });
    expect(api.photos).toEqual(["srv-2"]);
    expect(api.posts[1]).toMatchObject({ photoIds: ["srv-1", "srv-2"] });
  });

  it("keeps it queued when photos expire twice", async () => {
    const store = memoryDraftStore();
    const record = returnDraft([photo(1, "old-1")]);
    await store.put(record);
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/photos")
        ? Response.json({ data: { id: "srv-1" } }, { status: 201 })
        : Response.json(
            {
              data: {
                code: "PHOTOS_EXPIRED",
                expiredPhotoIds: ["old-1", "srv-1"],
              },
            },
            { status: 422 },
          ),
    );
    expect(await returnSender(store, fetcher)(record)).toEqual({
      kind: "RETRY",
    });
  });

  it("rejects a note the server refuses, keeping the counts", async () => {
    const store = memoryDraftStore();
    const record = returnDraft([]);
    await store.put(record);
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          error:
            "GG-K17: trả về và mất (125 cái) nhiều hơn số đang ở công trình (120 cái). Kiểm tra lại số đếm.",
        },
        { status: 409 },
      ),
    );
    const outbox = createOutbox({
      store,
      userId: "vantung",
      send: returnSender(store, fetcher),
    });
    expect(await outbox.submit(record.draftId)).toMatchObject({
      kind: "REJECTED",
    });
    expect((await store.get(record.draftId))?.state).toBe("REJECTED");
  });

  it("keeps it queued when signed out", async () => {
    const store = memoryDraftStore();
    const record = returnDraft([photo(1)]);
    await store.put(record);
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 401 }),
    );
    expect(await returnSender(store, fetcher)(record)).toEqual({
      kind: "SIGNED_OUT",
    });
  });

  it("is picked by draftSender for RETURN drafts", async () => {
    const store = memoryDraftStore();
    const record = returnDraft([]);
    await store.put(record);
    const api = server();
    await draftSender(api.fetcher, store)(record);
    expect(String(api.fetcher.mock.calls[0]?.[0])).toBe("/api/m/returns");
  });
});
