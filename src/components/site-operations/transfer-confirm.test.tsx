// M9, M1 "Chuyển công trình" and M7 "Chuyển" (site-operations task 6.3;
// spec site-transfers "Người đi xe xác nhận trên M9", "M9 không hiện giá",
// mobile-home, mobile-history).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HistoryList } from "@/components/receiving/history-list";
import { resetDraftRuntime } from "@/lib/drafts/runtime";
import { memoryDraftStore, setDraftStore } from "@/lib/drafts/store";
import type { TransferView } from "@/lib/site-transfers/queries";
import type { BusinessDate } from "@/domain/business-date";

import { lineNote, totalText } from "./transfer-confirm-model";
import { TransferConfirmScreen } from "./transfer-confirm-screen";
import { TransferHome } from "./transfer-home";

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

const transfer: TransferView = {
  id: "t1",
  code: "CCT-2026-004",
  status: "SENT",
  confirmMode: "PHONE",
  from: {
    contractId: "a",
    contractCode: "102026/ANPHAT-MINHPHAT",
    customerName: "Minh Phát",
    siteName: "An Phú",
    siteAddress: null,
  },
  to: {
    contractId: "b",
    contractCode: "112026/ANPHAT-MINHPHAT",
    customerName: "Minh Phát",
    siteName: "Dương Nội",
    siteAddress: "Hà Đông, Hà Nội",
  },
  vehiclePlate: null,
  note: null,
  businessDate: null,
  confirmedOnDeviceAt: null,
  postedByName: null,
  postedAt: null,
  cancelledReason: null,
  otherCustomerConfirmed: false,
  overContractConfirmed: false,
  sameCustomer: null,
  updatedAt: "2026-11-05T08:30:00.000Z",
  lines: [
    {
      itemId: "h17",
      itemCode: "H1,7",
      itemName: "Khung giàn giáo 1,7m",
      unit: "PIECE",
      planned: "50",
      moved: null,
    },
    {
      itemId: "cheo",
      itemCode: "CHEO1,7",
      itemName: "Chéo giàn giáo",
      unit: "PIECE",
      planned: "40",
      moved: null,
    },
  ],
};

describe("M9 model", () => {
  it("says what stays at the source", () => {
    const payload = {
      moved: { cheo: "36" },
      vehiclePlate: "",
      confirmedOnDeviceAt: null,
    };
    expect(lineNote(transfer.lines[0]!, payload, "An Phú")).toBe(
      "Đủ số văn phòng ghi.",
    );
    expect(lineNote(transfer.lines[1]!, payload, "An Phú")).toBe(
      "Chở ít hơn 4 cái. 4 cái còn ở An Phú.",
    );
    expect(totalText(transfer.lines, payload)).toBe("86 / 90 cái");
  });
});

describe("TransferConfirmScreen", () => {
  it("shows the route and no price, and sends what was carried", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { code: "CCT-2026-004" } }),
        { status: 201 },
      ),
    );
    const user = userEvent.setup();
    render(<TransferConfirmScreen transfer={transfer} userId="u1" />);
    expect(await screen.findByText("Dương Nội")).toBeInTheDocument();
    expect(screen.queryByText(/₫/)).toBeNull();
    await user.click(
      within(screen.getByRole("article", { name: "CHEO1,7" })).getByRole(
        "button",
        { name: "Giảm" },
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Xác nhận đã chuyển tới Dương Nội" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/m"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/m/site-transfers/CCT-2026-004/post");
    expect(JSON.parse(String(init.body))).toMatchObject({
      lines: [
        { itemId: "h17", moved: "50" },
        { itemId: "cheo", moved: "39" },
      ],
    });
  });

  it("shows a posted transfer read-only", () => {
    render(
      <TransferConfirmScreen
        transfer={{ ...transfer, status: "POSTED" }}
        userId="u1"
      />,
    );
    expect(screen.queryByRole("button", { name: /Xác nhận/ })).toBeNull();
    expect(screen.getByText("Thực chở")).toBeInTheDocument();
  });
});

describe("M1 and M7", () => {
  it("shows a card per transfer waiting on the phone", () => {
    render(
      <TransferHome
        transfers={[
          {
            id: "t1",
            code: "CCT-2026-004",
            status: "SENT",
            fromContractId: "a",
            toContractId: "b",
            fromSite: "An Phú – Block B",
            toSite: "Trường THCS Dương Nội",
            businessDate: null,
            postedAt: null,
            createdAt: "2026-11-05T08:30:00.000Z",
            lines: [{ unit: "PIECE", milli: 90_000 }],
          },
        ]}
      />,
    );
    expect(
      screen.getByText(
        "CCT-2026-004 · An Phú – Block B → Trường THCS Dương Nội · 90 cái",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xác nhận" })).toHaveAttribute(
      "href",
      "/m/site-transfers/CCT-2026-004",
    );
  });

  it("lists a posted transfer in the history", async () => {
    render(
      <HistoryList
        userId="u1"
        receipts={null}
        transfers={{
          days: [
            {
              date: "2026-11-05" as BusinessDate,
              transfers: [
                {
                  code: "CCT-2026-004",
                  route: "An Phú – Block B → Trường THCS Dương Nội",
                  text: "86 cái",
                  postedAt: new Date("2026-11-05T09:05:00Z"),
                },
              ],
            },
          ],
          hasMore: false,
        }}
        type="transfer"
        dayLabels={{ "2026-11-05": "Hôm nay, 05/11" }}
        olderHref={null}
        now="2026-11-05T10:00:00.000Z"
      />,
    );
    expect(await screen.findByText("Chuyển CCT-2026-004")).toBeInTheDocument();
    expect(
      screen.getByText("An Phú – Block B → Trường THCS Dương Nội · 86 cái"),
    ).toBeInTheDocument();
  });
});
