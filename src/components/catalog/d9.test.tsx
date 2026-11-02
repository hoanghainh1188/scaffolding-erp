import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ItemRow } from "@/lib/catalog/items";
import type { KitRow } from "@/lib/catalog/kits";

import { ItemFormSheet } from "./item-form-sheet";
import { ItemKitsPanel } from "./item-kits-panel";
import { ItemsFilters } from "./items-filters";
import { ItemsHeader } from "./items-header";
import { ItemsTable } from "./items-table";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace }),
  usePathname: () => "/catalog/items",
  useSearchParams: () => new URLSearchParams(),
}));

const row = (
  code: string,
  name: string,
  groupName: string,
  weight: string | null,
  daily: number | null,
  unit: ItemRow["unit"] = "PIECE",
): ItemRow => ({
  id: code,
  code,
  name,
  groupId: groupName,
  groupName,
  category: "EQUIPMENT",
  unit,
  unitLabel: { PIECE: "cái", METER: "m", KG: "kg" }[unit as string] ?? unit,
  aliases: [],
  standardWeightKg: weight,
  dailyRentalPrice: daily,
  lostPrice: null,
  damagePrice: null,
  status: "ACTIVE",
});

// The 8 items drawn in D9-Items.dc.html.
const ITEMS: ItemRow[] = [
  row("GG-K17", "Khung giàn giáo 1,7m", "Giàn giáo", "13.500", 1200),
  row("GG-K15", "Khung giàn giáo 1,5m", "Giàn giáo", "12.200", 1000),
  row("GG-CH", "Chéo giàn giáo", "Giàn giáo", "2.800", 300),
  row("GG-M16", "Mâm giàn giáo 1,6m", "Giàn giáo", "11.000", 900),
  row("PK-KU", "Kích tăng U", "Phụ kiện", "3.600", 400),
  row("OT-06", "Tuýp thép 6m", "Ống thép", "25.000", 1500),
  row("PK-CX", "Cùm xoay", "Phụ kiện", "1.100", 150),
  row("PL-SAT", "Phế liệu sắt lẫn", "Phế liệu", null, null, "KG"),
];

const SET: KitRow = {
  id: "kit",
  code: "BO-17",
  name: "Bộ giàn giáo 1,7m",
  status: "ACTIVE",
  components: [
    {
      itemId: "GG-K17",
      code: "GG-K17",
      name: "Khung giàn giáo 1,7m",
      quantity: 2,
    },
    { itemId: "GG-CH", code: "GG-CH", name: "Chéo giàn giáo", quantity: 2 },
    {
      itemId: "GG-M16",
      code: "GG-M16",
      name: "Mâm giàn giáo 1,6m",
      quantity: 1,
    },
  ],
  weightMilli: 43_600,
  rentalPerDay: 3900,
};

const rowOf = (code: string) =>
  screen.getByText(code).closest("tr") as HTMLElement;

describe("D9 items", () => {
  it("counts items and kits in the heading and tabs", () => {
    render(
      <ItemsHeader
        activeItems={48}
        activeKits={6}
        groupCount={5}
        tab="items"
      />,
    );
    expect(screen.getByText("48 mã hàng · 6 bộ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vật tư · 48" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Bộ · 6" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Nhóm hàng · 5" }),
    ).toBeInTheDocument();
  });

  it("shows weight, daily rent and rent × 30 per month", () => {
    render(<ItemsTable items={ITEMS} query="" selectedCode={null} />);
    const frame = within(rowOf("GG-K17"));
    expect(frame.getByText("13,5 kg")).toBeInTheDocument();
    expect(frame.getByText("1.200 ₫")).toBeInTheDocument();
    expect(frame.getByText("36.000 ₫")).toBeInTheDocument();
    expect(
      screen.getByText("Giá tháng tự tính bằng giá ngày × 30."),
    ).toBeInTheDocument();
  });

  it("shows – and Không cho thuê for scrap sold by kg", () => {
    render(<ItemsTable items={ITEMS} query="" selectedCode={null} />);
    const scrap = within(rowOf("PL-SAT"));
    expect(scrap.getAllByText("–")).toHaveLength(2);
    expect(scrap.getByText("Không cho thuê")).toBeInTheDocument();
    expect(scrap.getByText("kg")).toBeInTheDocument();
  });

  it("links each name to its Thuộc bộ panel, keeping the filters", () => {
    render(<ItemsTable items={ITEMS} query="group=g1" selectedCode="GG-K17" />);
    const link = screen.getByRole("link", { name: /Khung giàn giáo 1,7m/ });
    expect(link).toHaveAttribute("href", "/catalog/items?group=g1&item=GG-K17");
    expect(link).toHaveAttribute("aria-current", "true");
  });

  it("shows the kits of the chosen item with weight and rent", () => {
    render(<ItemKitsPanel item={ITEMS[0] ?? null} kits={[SET]} />);
    expect(screen.getByText("Bộ giàn giáo 1,7m")).toBeInTheDocument();
    expect(
      screen.getByText("Khung giàn giáo 1,7m", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("43,6 kg")).toBeInTheDocument();
    expect(screen.getByText("3.900 ₫")).toBeInTheDocument();
  });

  it("invites to pick an item when none is chosen", () => {
    render(<ItemKitsPanel item={null} kits={[]} />);
    expect(
      screen.getByText(
        "Chọn một vật tư trong bảng để xem nó nằm trong bộ nào.",
      ),
    ).toBeInTheDocument();
  });
});

describe("D9 item form", () => {
  async function openForm() {
    const user = userEvent.setup();
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<ItemFormSheet groups={[{ id: "g1", name: "Giàn giáo" }]} />);
    await user.click(screen.getByRole("button", { name: "Thêm vật tư" }));
    return { user, fetch };
  }

  it("checks the weight before sending, with the server's words", async () => {
    const { user, fetch } = await openForm();
    await user.type(screen.getByLabelText("Mã hàng"), "gg-k17");
    expect(screen.getByLabelText("Mã hàng")).toHaveValue("GG-K17");
    await user.type(
      screen.getByLabelText("Tên vật tư"),
      "Khung giàn giáo 1,7m",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Thêm vật tư" }).at(-1)!,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nhập trọng lượng chuẩn lớn hơn 0 kg",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a code with a slash", async () => {
    const { user, fetch } = await openForm();
    await user.type(screen.getByLabelText("Mã hàng"), "H1/7");
    await user.clear(screen.getByLabelText("Trọng lượng chuẩn (kg / cái)"));
    await user.type(
      screen.getByLabelText("Trọng lượng chuẩn (kg / cái)"),
      "13,5{Tab}",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Thêm vật tư" }).at(-1)!,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Mã chỉ gồm chữ in hoa, số và các dấu , * + - hoặc khoảng trắng",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the monthly rent as daily × 30 while typing", async () => {
    const { user } = await openForm();
    await user.type(screen.getByLabelText("Giá thuê / ngày (₫/cái)"), "1200");
    expect(
      screen.getByText(/Giá thuê \/ tháng: 36\.000 ₫/),
    ).toBeInTheDocument();
  });
});

describe("D9 catalog-extensions", () => {
  it("labels the weight per metre once m is chosen", async () => {
    const user = userEvent.setup();
    render(<ItemFormSheet groups={[{ id: "g1", name: "Thép ống" }]} />);
    await user.click(screen.getByRole("button", { name: "Thêm vật tư" }));
    await user.selectOptions(screen.getByLabelText("Đơn vị tính"), "METER");
    expect(
      screen.getByLabelText("Trọng lượng chuẩn (kg / m)"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Giá thuê / ngày (₫/m)")).toBeInTheDocument();
  });

  it("shows ONG-49 rent per metre and old codes under the code", () => {
    const pipe = {
      ...row("ONG-49", "Thép ống D49", "Thép ống", "3.560", 150, "METER"),
      aliases: ["ONG49", "D49"],
    };
    render(<ItemsTable items={[pipe]} query="" selectedCode={null} />);
    const line = rowOf("ONG-49");
    expect(within(line).getByText("150 ₫/m")).toBeInTheDocument();
    expect(within(line).getByText("4.500 ₫/m")).toBeInTheDocument();
    expect(within(line).getByText("3,56 kg/m")).toBeInTheDocument();
    expect(within(line).getByText("Mã cũ: ONG49, D49")).toBeInTheDocument();
  });

  it("puts ?category=MATERIAL on the URL for Vật tư", async () => {
    const user = userEvent.setup();
    replace.mockClear();
    render(
      <ItemsFilters
        groups={[
          { id: "g1", name: "Giàn giáo", category: "EQUIPMENT" },
          { id: "g2", name: "Que hàn", category: "MATERIAL" },
        ]}
        placeholder="Tìm vật tư"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Vật tư" }));
    expect(replace).toHaveBeenCalledWith("/catalog/items?category=MATERIAL");
  });
});
