import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OfflineBanner } from "@/components/shell/mobile/offline-banner";
import { resetDraftRuntime } from "@/lib/drafts/runtime";
import {
  memoryDraftStore,
  setDraftStore,
  type DraftRecord,
  type DraftStore,
} from "@/lib/drafts/store";

import { AUTOSAVE_MS, useDraft } from "./use-draft";

interface Counts {
  khung: string;
  cheo: string;
}

let store: DraftStore;
beforeEach(() => {
  store = memoryDraftStore();
  setDraftStore(store);
  resetDraftRuntime();
});
afterEach(() => {
  setDraftStore(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const options = {
  kind: "GOODS_RECEIPT" as const,
  userId: "vantung",
  documentRef: "PO-2026-052",
  title: "Nhập PO-2026-052 · anh Trần Văn Hùng",
  initial: (): Counts => ({ khung: "", cheo: "" }),
  progressOf: (counts: Counts) =>
    `${[counts.khung, counts.cheo].filter(Boolean).length}/4 mã xong`,
};

describe("useDraft", () => {
  it("saves a change after 500 ms and restores it when the page opens again", async () => {
    const first = renderHook(() => useDraft(options));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    vi.useFakeTimers();
    act(() => first.result.current.update({ khung: "196", cheo: "400" }));
    expect(await store.list("vantung")).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
    vi.useRealTimers();
    const [saved] = await store.list("vantung");
    expect(saved).toMatchObject({
      payload: { khung: "196", cheo: "400" },
      progress: "2/4 mã xong",
      state: "EDITING",
    });
    first.unmount();

    const again = renderHook(() => useDraft(options));
    await waitFor(() => expect(again.result.current.ready).toBe(true));
    expect(again.result.current.payload).toEqual({ khung: "196", cheo: "400" });
    expect(again.result.current.record?.draftId).toBe(saved?.draftId);
  });

  it("writes a change still waiting when the page closes", async () => {
    const hook = renderHook(() => useDraft(options));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => hook.result.current.update({ khung: "12", cheo: "" }));
    hook.unmount();
    await waitFor(async () =>
      expect((await store.list("vantung"))[0]?.payload).toEqual({
        khung: "12",
        cheo: "",
      }),
    );
  });

  it("does not open another user's draft", async () => {
    await store.put({
      draftId: "d1",
      kind: "GOODS_RECEIPT",
      userId: "ducthang",
      documentRef: "PO-2026-052",
      title: "x",
      progress: "",
      payload: { khung: "5", cheo: "" },
      state: "EDITING",
      error: null,
      createdAt: "2026-10-26T01:00:00Z",
      updatedAt: "2026-10-26T01:00:00Z",
      attempts: 0,
    });
    const hook = renderHook(() => useDraft(options));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.payload).toEqual({ khung: "", cheo: "" });
  });

  it("locks a queued draft", async () => {
    const hook = renderHook(() => useDraft(options));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await act(async () => {
      await hook.result.current.saveNow({ state: "QUEUED" });
    });
    expect(hook.result.current.editable).toBe(false);
    act(() => hook.result.current.update({ khung: "1", cheo: "" }));
    expect(hook.result.current.payload).toEqual({ khung: "", cheo: "" });
  });
});

describe("useDraft with a version", () => {
  const versioned = (version: string) => ({
    ...options,
    version,
    initial: (): Counts => ({ khung: `mới ${version}`, cheo: "" }),
  });
  const stored = (state: DraftRecord["state"], version?: string) =>
    store.put({
      draftId: "d1",
      kind: "GOODS_RECEIPT",
      userId: "vantung",
      documentRef: "PO-2026-052",
      title: "x",
      progress: "",
      payload: { khung: "cũ", cheo: "" },
      state,
      error: null,
      createdAt: "2026-10-26T01:00:00Z",
      updatedAt: "2026-10-26T01:00:00Z",
      attempts: 0,
      ...(version ? { version } : {}),
    });

  it("stamps a new draft with the version", async () => {
    const hook = renderHook(() => useDraft(versioned("v1")));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.record?.version).toBe("v1");
    expect(hook.result.current.reopened).toBe(false);
  });

  it("keeps a draft of the same version", async () => {
    await stored("EDITING", "v1");
    const hook = renderHook(() => useDraft(versioned("v1")));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.payload.khung).toBe("cũ");
    expect(hook.result.current.reopened).toBe(false);
  });

  it.each<[string, DraftRecord["state"], string | undefined]>([
    ["an older version", "EDITING", "v1"],
    ["a refused draft", "REJECTED", "v1"],
    ["a draft from before versions", "EDITING", undefined],
  ])("drops %s and opens the new numbers", async (_name, state, version) => {
    await stored(state, version);
    const hook = renderHook(() => useDraft(versioned("v2")));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.payload.khung).toBe("mới v2");
    expect(hook.result.current.record?.version).toBe("v2");
    expect(hook.result.current.record?.draftId).not.toBe("d1");
    expect(hook.result.current.reopened).toBe(true);
    expect(await store.get("d1")).toBeNull();
  });

  it("leaves a queued draft to get its 409", async () => {
    await stored("QUEUED", "v1");
    const hook = renderHook(() => useDraft(versioned("v2")));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.record?.draftId).toBe("d1");
    expect(hook.result.current.record?.version).toBe("v1");
    expect(hook.result.current.editable).toBe(false);
    expect(hook.result.current.reopened).toBe(false);
  });

  it("drops a change still waiting when the version moves on the open page", async () => {
    const hook = renderHook(({ version }) => useDraft(versioned(version)), {
      initialProps: { version: "v1" },
    });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => hook.result.current.update({ khung: "gõ dở", cheo: "" }));
    hook.rerender({ version: "v2" });
    await waitFor(() => expect(hook.result.current.record?.version).toBe("v2"));
    expect(hook.result.current.payload.khung).toBe("mới v2");
    expect(hook.result.current.reopened).toBe(true);
    hook.unmount();
    expect(await store.list("vantung")).toEqual([]);
  });

  it("does not let typing during the reopening write the old draft back", async () => {
    await stored("EDITING", "v1");
    const hook = renderHook(({ version }) => useDraft(versioned(version)), {
      initialProps: { version: "v1" },
    });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const list = store.list.bind(store);
    vi.spyOn(store, "list").mockImplementation(async (userId) => {
      const rows = await list(userId);
      await gate;
      return rows;
    });
    hook.rerender({ version: "v2" });
    act(() => hook.result.current.update({ khung: "gõ dở", cheo: "" }));
    release();
    await waitFor(() => expect(hook.result.current.record?.version).toBe("v2"));
    expect(hook.result.current.payload.khung).toBe("mới v2");
    expect(hook.result.current.reopened).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_MS + 50));
    vi.restoreAllMocks();
    expect(await store.list("vantung")).toEqual([]);
  });

  it("does not look at versions without the option", async () => {
    await stored("EDITING", "v1");
    const hook = renderHook(() => useDraft(options));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.payload.khung).toBe("cũ");
  });
});

describe("offline banner on a draft page", () => {
  function Page() {
    useDraft(options);
    return <OfflineBanner />;
  }

  it("says the draft is saved while offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<Page />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Mất kết nối – đã lưu nháp",
    );
  });
});
