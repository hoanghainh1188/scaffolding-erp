// M8 and the M1 repair cards (repair-work-orders tasks 8.1–8.3; spec
// repair-mobile, mobile-home). No price on any of them.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDraftRuntime } from "@/lib/drafts/runtime";
import { memoryDraftStore, setDraftStore } from "@/lib/drafts/store";
import type { PhoneOrder, PhoneOrderCard } from "@/lib/repairs/phone-queries";

import { RepairPhoneCards, cardTitle } from "./repair-phone-list";
import { footerText, initialPayload } from "./repair-phone-model";
import { RepairPhoneScreen } from "./repair-phone-screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  setDraftStore(memoryDraftStore());
  resetDraftRuntime();
  push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  setDraftStore(null);
  vi.unstubAllGlobals();
});

const card: PhoneOrderCard = {
  code: "PSC-2026-031",
  status: "ASSIGNED",
  repairedBy: "tổ anh Lực",
  fromCode: "BAI-01",
  workshopCode: "XUONG-01",
  workshopName: "Xưởng",
  lineCount: 2,
  taken: [{ unit: "PIECE", milli: 60_000 }],
  returnNote: null,
};

const order: PhoneOrder = {
  code: "PSC-2026-031",
  status: "IN_PROGRESS",
  repairedBy: "tổ anh Lực",
  fromCode: "BAI-01",
  workshopCode: "XUONG-01",
  workshopName: "Xưởng",
  receivedAt: "2026-11-03T02:00:00.000Z",
  returnNote: null,
  updatedAt: "2026-11-03T02:00:00.000Z",
  lines: [
    {
      itemId: "k17",
      code: "GG-K17",
      name: "Khung giàn giáo 1,7m",
      unit: "PIECE",
      taken: "40.000",
      good: "0.000",
      scrap: "0.000",
      reportedGood: null,
      reportedScrap: null,
      materials: [],
    },
    {
      itemId: "cheo",
      code: "CHEO-1,7",
      name: "Chéo giàn giáo 1,7m",
      unit: "PIECE",
      taken: "20.000",
      good: "0.000",
      scrap: "0.000",
      reportedGood: null,
      reportedScrap: null,
      materials: [],
    },
  ],
};

const supplies = [
  { itemId: "qh", code: "VT-QH", name: "Que hàn", unit: "KG" as const },
];

describe("repair cards (spec: danh sách lệnh trên điện thoại)", () => {
  it("names the order without a price and offers Nhận lệnh", () => {
    render(<RepairPhoneCards cards={[card]} />);
    expect(
      screen.getByText(
        "PSC-2026-031 · tổ anh Lực · BAI-01 → XUONG-01 · 2 mã · 60 cái",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nhận lệnh" })).toHaveAttribute(
      "href",
      "/m/repairs/PSC-2026-031",
    );
    expect(document.body.textContent).not.toMatch(/₫/);
  });

  it("marks an order the office sent back", () => {
    render(
      <RepairPhoneCards
        cards={[{ ...card, status: "IN_PROGRESS", returnNote: "Kiểm lại" }]}
      />,
    );
    expect(screen.getByText("Văn phòng trả lại")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tiếp tục" })).toBeInTheDocument();
    expect(cardTitle(card)).toContain("60 cái");
  });
});

describe("M8 (spec: màn M8 ghi số sửa)", () => {
  it("adds up the footer like the drawing", () => {
    const payload = initialPayload(order);
    payload.lines.k17 = { goodMilli: 36_000, scrapMilli: 4_000, materials: [] };
    payload.lines.cheo = { goodMilli: 20_000, scrapMilli: 0, materials: [] };
    expect(footerText(order, payload)).toBe("56 sửa xong · 4 phế · đủ 60 / 60");
  });

  it("keeps Báo sửa xong locked until every item adds up", async () => {
    render(
      <RepairPhoneScreen
        order={order}
        supplies={supplies}
        userId="u1"
        mode="work"
      />,
    );
    const button = await screen.findByRole("button", { name: "Báo sửa xong" });
    expect(button).toBeDisabled();
    expect(
      screen.getAllByText("Sửa xong + Phế (0) phải bằng số nhận (40)").length,
    ).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/₫/);
  });

  it("shows the office's reason when sent back", async () => {
    render(
      <RepairPhoneScreen
        order={{ ...order, returnNote: "Que hàn ghi 60 kg, kiểm lại" }}
        supplies={supplies}
        userId="u1"
        mode="work"
      />,
    );
    expect(
      await screen.findByText("Văn phòng trả lại: Que hàn ghi 60 kg, kiểm lại"),
    ).toBeInTheDocument();
  });

  it("lets the storekeeper count from the workshop's numbers", async () => {
    render(
      <RepairPhoneScreen
        order={{
          ...order,
          status: "AWAITING_CHECK",
          lines: order.lines.map((line) => ({
            ...line,
            good: line.taken,
            reportedGood: line.taken,
            reportedScrap: "0.000",
          })),
        }}
        supplies={supplies}
        userId="u2"
        mode="count"
      />,
    );
    const button = await screen.findByRole("button", { name: "Đếm xong" });
    expect(button).toBeEnabled();
    expect(
      screen.getByText("Xưởng báo 40 sửa xong, 0 phế"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Báo sửa xong" })).toBeNull();
  });

  it("asks again before taking the order, then sends a draft id", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        success: true,
        data: { code: "PSC-2026-031" },
        error: null,
      }),
    );
    render(
      <RepairPhoneScreen
        order={{ ...order, status: "ASSIGNED", receivedAt: null }}
        supplies={supplies}
        userId="u1"
        mode="work"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Nhận lệnh" }));
    expect(
      screen.getByText(
        "Nhận 60 cái từ BAI-01 về XUONG-01? Sổ kho sẽ ghi chuyển hàng.",
      ),
    ).toBeInTheDocument();
    const confirm = screen.getAllByRole("button", { name: "Nhận lệnh" }).at(-1);
    if (!confirm) throw new Error("no confirm button");
    await userEvent.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/m/repairs/PSC-2026-031/receive");
    expect(JSON.parse(String(init.body))).toMatchObject({
      updatedAt: order.updatedAt,
      draftId: expect.any(String),
    });
  });
});
