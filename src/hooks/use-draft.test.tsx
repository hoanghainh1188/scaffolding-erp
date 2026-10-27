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
