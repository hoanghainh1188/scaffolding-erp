// M10 and the M1 production cards (production-orders tasks 4.7–4.9; spec
// production-mobile, mobile-home). No price on any of them.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDraftRuntime } from "@/lib/drafts/runtime";
import { memoryDraftStore, setDraftStore } from "@/lib/drafts/store";
import type {
  ProductionPhoneCard,
  ProductionPhoneLine,
  ProductionPhoneOrder,
} from "@/lib/production/phone-queries";

import {
  ProductionPhoneCards,
  productionCardTitle,
} from "./production-phone-list";
import {
  footerText,
  initialPayload,
  lineOf,
  overuseWarning,
  stepBody,
  withAdded,
  withFinished,
  withMaterial,
  withoutMaterial,
} from "./production-phone-model";
import { ProductionPhoneScreen } from "./production-phone-screen";

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

const card: ProductionPhoneCard = {
  code: "LSX-2026-004",
  status: "ASSIGNED",
  team: "tổ anh Lực",
  workshopCode: "XUONG-01",
  toCode: "BAI-01",
  lineCount: 2,
  planned: [{ unit: "PIECE", milli: 300_000 }],
  returnNote: null,
};

const line: ProductionPhoneLine = {
  itemId: "k17",
  code: "GG-K17",
  name: "Khung giàn giáo 1,7m",
  unit: "PIECE",
  planned: "100.000",
  reportedFinished: null,
  reportedOffcutKg: null,
  materials: [
    {
      itemId: "ong42",
      code: "VT-ONG42",
      name: "Ống D42",
      unit: "KG",
      normPerUnit: "9.800",
      reported: null,
    },
    {
      itemId: "ong27",
      code: "VT-ONG27",
      name: "Ống D27",
      unit: "KG",
      normPerUnit: "3.600",
      reported: null,
    },
    {
      itemId: "thanh",
      code: "VT-THANH",
      name: "Thanh giằng",
      unit: "BAR",
      normPerUnit: "0.500",
      reported: null,
    },
  ],
};

const order: ProductionPhoneOrder = {
  code: "LSX-2026-004",
  status: "IN_PROGRESS",
  team: "tổ anh Lực",
  workshopCode: "XUONG-01",
  toCode: "BAI-01",
  receivedAt: "2026-11-04T02:00:00.000Z",
  returnNote: null,
  updatedAt: "2026-11-04T02:00:00.000Z",
  lines: [line],
};

describe("cards", () => {
  it("reads like the spec", () => {
    expect(productionCardTitle(card)).toBe(
      "LSX-2026-004 · tổ anh Lực · XUONG-01 → BAI-01 · 300 cái",
    );
  });

  it("offers the step of the status and marks a returned order", () => {
    render(
      <ProductionPhoneCards
        cards={[
          card,
          {
            ...card,
            code: "LSX-2026-005",
            status: "IN_PROGRESS",
            returnNote: "Đếm lại",
          },
          { ...card, code: "LSX-2026-006", status: "AWAITING_CHECK" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Nhận lệnh" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tiếp tục" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Đếm thành phẩm" })).toBeTruthy();
    expect(screen.getByText("Văn phòng trả lại")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/₫/);
  });
});

describe("the draft (spec: xưởng ghi số trên M10)", () => {
  const start = () => lineOf(initialPayload(order), "k17");

  it("fills materials from the norm", () => {
    expect(start().materials.map((m) => m.milli)).toEqual([
      980_000, 360_000, 50_000,
    ]);
  });

  it("follows the finished pieces until a number is typed", () => {
    const typed = withMaterial(start(), "ong27", 391_000);
    const next = withFinished(typed, 90_000);
    expect(next.materials.map((m) => m.milli)).toEqual([
      882_000, 391_000, 45_000,
    ]);
  });

  it("rounds a count unit up: 0,5 cây × 3 = 2", () => {
    expect(withFinished(start(), 3_000).materials[2]?.milli).toBe(2_000);
  });

  it("warns above the limit only", () => {
    const over = withMaterial(start(), "ong27", 391_000);
    const material = over.materials[1];
    if (!material) throw new Error("no material");
    expect(overuseWarning(material, over.finishedMilli)).toBe(
      "Ống D27 vượt định mức 8,6 %: văn phòng sẽ hỏi Giám đốc",
    );
    const fine = start().materials[1];
    if (!fine) throw new Error("no material");
    expect(overuseWarning(fine, 100_000)).toBeNull();
  });

  it("removes workshop rows and zeroes norm rows", () => {
    const added = withAdded(start(), {
      itemId: "qh",
      code: "VT-QH",
      name: "Que hàn",
      unit: "KG",
    });
    expect(added.materials).toHaveLength(4);
    const gone = withoutMaterial(added, "qh");
    expect(gone.materials).toHaveLength(3);
    const zero = withoutMaterial(gone, "ong42");
    expect(zero.materials[0]?.milli).toBe(0);
    expect(zero.materials[0]?.edited).toBe(true);
  });

  it("opens with what the workshop reported", () => {
    const reported: ProductionPhoneOrder = {
      ...order,
      lines: [
        {
          ...line,
          reportedFinished: "102.000",
          reportedOffcutKg: "38.000",
          materials: [
            {
              ...(line.materials[0] as ProductionPhoneLine["materials"][0]),
              reported: "1012.000",
            },
          ],
        },
      ],
    };
    const draft = lineOf(initialPayload(reported), "k17");
    expect(draft.finishedMilli).toBe(102_000);
    expect(draft.offcutMilli).toBe(38_000);
    expect(draft.materials[0]?.milli).toBe(1_012_000);
    expect(draft.materials[0]?.edited).toBe(true);
  });

  it("sends numbers only", () => {
    const body = stepBody(order, initialPayload(order));
    expect(body.lines[0]).toMatchObject({
      itemId: "k17",
      finished: "100.000",
      offcutKg: "0.000",
    });
    expect(body.lines[0]?.materials[2]).toEqual({
      itemId: "thanh",
      quantity: "50.000",
    });
    expect(footerText(order, initialPayload(order))).toBe("100 / 100 cái");
  });
});

describe("the screen", () => {
  it("shows the prefilled numbers and no money, then sends the report", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        success: true,
        data: { code: order.code, status: "AWAITING_CHECK" },
        error: null,
      }),
    );
    const user = userEvent.setup();
    render(
      <ProductionPhoneScreen
        order={order}
        materials={[]}
        userId="u1"
        mode="work"
      />,
    );
    const input = await screen.findByRole("textbox", {
      name: "Ống D42 thực dùng (kg)",
    });
    expect(input).toHaveValue("980");
    expect(document.body.textContent).not.toMatch(/₫/);
    await user.click(screen.getByRole("button", { name: "Báo làm xong" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/m/production"));
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/m/production/LSX-2026-004/report");
  });

  it("asks the workshop to take an assigned order", async () => {
    render(
      <ProductionPhoneScreen
        order={{ ...order, status: "ASSIGNED" }}
        materials={[]}
        userId="u1"
        mode="work"
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Nhận lệnh" }),
    ).toBeTruthy();
  });

  it("counts on the same screen", async () => {
    render(
      <ProductionPhoneScreen
        order={{ ...order, status: "AWAITING_CHECK" }}
        materials={[]}
        userId="u2"
        mode="count"
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Đếm xong" }),
    ).toBeTruthy();
  });
});
