// M4, the M4 model, M1 "Thu hồi" and M7 return rows (returns-and-compensation
// tasks 6.2, 6.3; specs returns, return-photos "Chụp ảnh trên M4",
// mobile-home "Thu hồi trên Việc hôm nay", mobile-history).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HistoryList } from "@/components/receiving/history-list";
import type { BusinessDate } from "@/domain/business-date";
import { resetDraftRuntime } from "@/lib/drafts/runtime";
import {
  draftStore,
  memoryDraftStore,
  setDraftStore,
} from "@/lib/drafts/store";

import { ReturnHome } from "./return-home";
import { ReturnPicker } from "./return-picker";
import {
  blockers,
  bodyOf,
  checkLine,
  emptyLine,
  progressText,
  withTotal,
  type ReturnItem,
  type ReturnPayload,
} from "./return-model";
import { ReturnScreen } from "./return-screen";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  setDraftStore(memoryDraftStore());
  resetDraftRuntime();
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  setDraftStore(null);
  vi.unstubAllGlobals();
});

const K = 1000;
const ITEMS: ReturnItem[] = [
  {
    itemId: "h",
    code: "H1,7",
    name: "Khung giàn giáo 1,7m",
    unit: "PIECE",
    onSiteMilli: 120 * K,
  },
  {
    itemId: "c",
    code: "CHEO1,7",
    name: "Chéo giàn giáo",
    unit: "PIECE",
    onSiteMilli: 260 * K,
  },
  {
    itemId: "m",
    code: "MAM1,6",
    name: "Mâm giàn giáo 1,6m",
    unit: "PIECE",
    onSiteMilli: 60 * K,
  },
];

const payload = (lines: ReturnPayload["lines"]): ReturnPayload => ({
  contractId: "deal",
  yardLocationId: "bai",
  vehiclePlate: "29C-456.78",
  note: "",
  opened: Object.keys(lines),
  lines,
  photos: [],
  savedOnDeviceAt: null,
});

describe("return model", () => {
  const h = ITEMS[0] as ReturnItem;

  it("says when a line is fully split, or what is left", () => {
    expect(
      checkLine(h, {
        total: "100",
        good: "82",
        repair: "15",
        scrap: "3",
        lost: "2",
      }).text,
    ).toBe("Đã chia đủ 100 cái");
    expect(
      checkLine(ITEMS[1] as ReturnItem, {
        ...emptyLine(),
        total: "260",
        good: "250",
        repair: "5",
      }),
    ).toMatchObject({ ok: false, text: "Còn 5 cái chưa phân loại" });
    expect(
      checkLine(h, { ...emptyLine(), total: "115", good: "115", lost: "10" }),
    ).toMatchObject({
      ok: false,
      text: "Trả về và mất (125 cái) nhiều hơn số đang ở công trình (120 cái)",
    });
    expect(checkLine(h, { ...emptyLine(), lost: "20" }).text).toBe(
      "Mất 20 cái",
    );
  });

  it("lets Tốt follow the total until something is split off", () => {
    const one = withTotal(emptyLine(), "1");
    const three = withTotal(one, "3");
    expect(three).toMatchObject({ total: "3", good: "3" });
    const split = withTotal({ ...three, repair: "1", good: "2" }, "4");
    expect(split).toMatchObject({ total: "4", good: "2", repair: "1" });
  });

  it("counts progress and blocks an empty note", () => {
    const one = payload({
      h: { total: "100", good: "100", repair: "", scrap: "", lost: "" },
    });
    expect(progressText(ITEMS, one)).toBe("1/3 mã đã đếm");
    expect(blockers(ITEMS, payload({}))).toEqual([
      "Nhập số trả về hoặc số mất của ít nhất một mã.",
    ]);
    expect(blockers(ITEMS, one)).toEqual([]);
  });

  it("sends only counted lines, with zeros filled in", () => {
    const body = bodyOf(
      ITEMS,
      payload({
        h: { total: "100", good: "82", repair: "15", scrap: "3", lost: "2" },
      }),
      "2026-11-05T02:40:00.000Z",
    );
    expect(body).toEqual({
      contractId: "deal",
      yardLocationId: "bai",
      vehiclePlate: "29C-456.78",
      note: null,
      savedOnDeviceAt: "2026-11-05T02:40:00.000Z",
      lines: [{ itemId: "h", good: "82", repair: "15", scrap: "3", lost: "2" }],
    });
  });
});

const screenProps = {
  userId: "vantung",
  contractId: "deal",
  contractCode: "112026/ANPHAT-MINHPHAT",
  siteName: "Chung cư An Phú – Block B",
  customerName: "Cty TNHH Xây dựng Minh Phát",
  yards: [{ id: "bai", code: "BAI-01", name: "Bãi chính" }],
  items: ITEMS,
};

describe("M4", () => {
  it("shows the site, each item on site and no money", async () => {
    render(<ReturnScreen {...screenProps} />);
    expect(
      await screen.findByText("Chung cư An Phú – Block B"),
    ).toBeInTheDocument();
    const card = screen.getByRole("article", { name: "MAM1,6" });
    expect(card).toHaveTextContent("Đang ở công trình: 60 cái · chưa đếm");
    expect(document.body.textContent).not.toContain("₫");
  });

  it("keeps the save button locked until the split is complete", async () => {
    const user = userEvent.setup();
    render(<ReturnScreen {...screenProps} />);
    const card = await screen.findByRole("article", { name: "CHEO1,7" });
    await user.click(within(card).getByRole("button", { name: "Đếm" }));
    const opened = screen.getByRole("article", { name: "CHEO1,7" });
    const total = within(opened).getByRole("textbox", {
      name: "CHEO1,7 tổng trả về",
    });
    await user.clear(total);
    await user.type(total, "260");
    await user.tab();
    const good = within(opened).getByRole("textbox", { name: "CHEO1,7 Tốt" });
    await user.clear(good);
    await user.type(good, "250");
    await user.tab();
    const repair = within(opened).getByRole("textbox", {
      name: "CHEO1,7 Chờ sửa",
    });
    await user.clear(repair);
    await user.type(repair, "5");
    await user.tab();
    expect(
      within(opened).getByText("Còn 5 cái chưa phân loại"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lưu phiếu thu hồi" }),
    ).toBeDisabled();
    const scrap = within(opened).getByRole("textbox", {
      name: "CHEO1,7 Phế liệu",
    });
    await user.clear(scrap);
    await user.type(scrap, "5");
    await user.tab();
    expect(within(opened).getByText("Đã chia đủ 260 cái")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lưu phiếu thu hồi" }),
    ).toBeEnabled();
  });

  it("saves the draft on the phone with its progress", async () => {
    const user = userEvent.setup();
    render(<ReturnScreen {...screenProps} />);
    const card = await screen.findByRole("article", { name: "H1,7" });
    await user.click(within(card).getByRole("button", { name: "Đếm" }));
    const total = within(
      screen.getByRole("article", { name: "H1,7" }),
    ).getByRole("textbox", { name: "H1,7 tổng trả về" });
    await user.clear(total);
    await user.type(total, "100");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    await waitFor(async () => {
      const [saved] = await draftStore().list("vantung");
      expect(saved).toMatchObject({
        kind: "RETURN",
        documentRef: "deal",
        title: "Thu hồi Chung cư An Phú – Block B",
        progress: "1/3 mã đã đếm",
      });
    });
  });

  it("refuses a seventh photo on the phone", async () => {
    const user = userEvent.setup();
    render(<ReturnScreen {...screenProps} />);
    await screen.findByText("Chung cư An Phú – Block B");
    const input = document.getElementById("camera") as HTMLInputElement;
    const files = Array.from(
      { length: 7 },
      (_, index) =>
        new File([new Uint8Array([0xff, 0xd8, 0xff, index])], `p${index}.jpg`, {
          type: "image/jpeg",
        }),
    );
    await user.upload(input, files);
    expect(
      await screen.findByText(
        "Mỗi phiếu thu hồi có tối đa 6 ảnh. Xóa bớt ảnh nếu cần chụp thêm.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Xóa ảnh/ })).toHaveLength(6);
  });

  it("posts and offers another contract with the same truck", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ data: { code: "PTH-2026-071" } }, { status: 201 }),
    );
    const user = userEvent.setup();
    render(<ReturnScreen {...screenProps} />);
    const card = await screen.findByRole("article", { name: "H1,7" });
    await user.click(within(card).getByRole("button", { name: "Đếm" }));
    const total = within(
      screen.getByRole("article", { name: "H1,7" }),
    ).getByRole("textbox", { name: "H1,7 tổng trả về" });
    await user.clear(total);
    await user.type(total, "10");
    await user.tab();
    await user.type(screen.getByLabelText("Biển số xe"), "29C-456.78");
    await user.click(screen.getByRole("button", { name: "Lưu phiếu thu hồi" }));
    expect(await screen.findByText("Đã lưu PTH-2026-071")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Thu hồi hợp đồng khác cùng xe" }),
    ).toHaveAttribute("href", "/m/returns/new?plate=29C-456.78");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/m/returns");
    expect(JSON.parse(String(init.body))).toMatchObject({
      contractId: "deal",
      lines: [{ itemId: "h", good: "10", repair: "0", scrap: "0", lost: "0" }],
    });
  });
});

describe("M4 contract list", () => {
  it("shows the site, customer, contract and what is on site", () => {
    render(
      <ReturnPicker
        query="An Phú"
        plate={null}
        rows={[
          {
            contractId: "deal",
            contractCode: "112026/ANPHAT-MINHPHAT",
            siteName: "Chung cư An Phú – Block B",
            customerName: "Cty TNHH Xây dựng Minh Phát",
            onSite: [{ unit: "PIECE", milli: 440 * K }],
          },
        ]}
      />,
    );
    expect(screen.getByRole("link")).toHaveTextContent(
      "Chung cư An Phú – Block BCty TNHH Xây dựng Minh Phát · 112026/ANPHAT-MINHPHAT · 440 cái",
    );
  });
});

describe("M1 and M7", () => {
  it("lists today's returns without money", () => {
    render(
      <ReturnHome
        notes={[
          {
            code: "PTH-2026-071",
            siteName: "An Phú – Block B",
            text: "trả 100 cái, mất 2 cái",
            postedAt: new Date("2026-11-05T02:40:00Z"),
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /PTH-2026-071/ }),
    ).toHaveTextContent("PTH-2026-071 · An Phú – Block B · trả 100, mất 2");
    expect(screen.getByRole("link", { name: "Nhập thu hồi" })).toHaveAttribute(
      "href",
      "/m/returns/new",
    );
  });

  it("shows return notes in M7 history", async () => {
    render(
      <HistoryList
        userId="vantung"
        receipts={null}
        returns={{
          days: [
            {
              date: "2026-11-05" as BusinessDate,
              notes: [
                {
                  code: "PTH-2026-071",
                  siteName: "An Phú – Block B",
                  text: "trả 100 cái, mất 2 cái",
                  postedAt: new Date("2026-11-05T02:40:00Z"),
                },
              ],
            },
          ],
          hasMore: false,
        }}
        type="return"
        dayLabels={{ "2026-11-05": "Hôm nay, 05/11" }}
        olderHref={null}
        now="2026-11-05T03:00:00Z"
      />,
    );
    const link = await screen.findByRole("link", {
      name: /Thu hồi PTH-2026-071/,
    });
    expect(link).toHaveAttribute("href", "/m/returns/PTH-2026-071");
    expect(link).toHaveTextContent("An Phú – Block B · trả 100 cái, mất 2 cái");
    expect(link).toHaveTextContent("09:40");
  });
});
