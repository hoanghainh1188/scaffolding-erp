// What a draft body may hold (contracts spec "Điều khoản", "VAT", "Cọc",
// "Kế hoạch giao", "Hợp đồng bán"): every rule answers with its field.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { item, kit } from "@/db/schema";
import { createTestContext } from "@/test/auth";
import {
  d5Rental,
  kgSale,
  setupContractFixture,
  type ContractFixture,
} from "@/test/contracts";

import { createContract, type ContractBody } from "./service";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ContractFixture;
beforeEach(async () => {
  fx = await setupContractFixture(ctx);
});

const save = (body: ContractBody) => createContract(ctx.db, fx.sales, body);

type Case = [
  string,
  (fx: ContractFixture) => ContractBody,
  string | ((fx: ContractFixture) => string),
  string,
];

const CASES: Case[] = [
  [
    "no type",
    (f) => ({ ...d5Rental(f), type: "LEASE" }),
    "type",
    "Chọn loại hợp đồng (Cho thuê hoặc Bán).",
  ],
  [
    "no customer",
    (f) => ({ ...d5Rental(f), customerId: "x" }),
    "customerId",
    "Chọn nhà thầu",
  ],
  [
    "no start date",
    (f) => ({ ...d5Rental(f), startDate: "" }),
    "startDate",
    "Nhập ngày bắt đầu.",
  ],
  [
    "a bad date",
    (f) => ({ ...d5Rental(f), signedDate: "28/10/2026" }),
    "signedDate",
    "Ngày không hợp lệ (dd/mm/yyyy).",
  ],
  [
    "an end before the start",
    (f) => ({ ...d5Rental(f), endDate: "2026-10-31" }),
    "endDate",
    "Ngày kết thúc phải sau ngày bắt đầu.",
  ],
  [
    "a minimum of 0 days",
    (f) => ({ ...d5Rental(f), minRentalDays: 0 }),
    "minRentalDays",
    "Thuê tối thiểu từ 1 đến 365 ngày.",
  ],
  [
    "payment terms of 400 days",
    (f) => ({ ...d5Rental(f), paymentTermsDays: 400 }),
    "paymentTermsDays",
    "Hạn thanh toán từ 0 đến 365 ngày.",
  ],
  [
    "VAT without rate",
    (f) => ({ ...d5Rental(f), vatEnabled: true, vatRate: "" }),
    "vatRate",
    "Bạn nhập thuế suất VAT.",
  ],
  [
    "VAT of 25 %",
    (f) => ({ ...d5Rental(f), vatEnabled: true, vatRate: "25" }),
    "vatRate",
    "Thuế suất VAT lớn hơn 0 % và tối đa 20 %, tối đa 2 chữ số lẻ.",
  ],
  [
    "a decimal freight",
    (f) => ({ ...d5Rental(f), companyTruck: true, freightPerTrip: 1.5 }),
    "freightPerTrip",
    "Giá phải là số nguyên từ 0 ₫ trở lên.",
  ],
  [
    "a long note",
    (f) => ({ ...d5Rental(f), note: "x".repeat(1001) }),
    "note",
    "Ghi chú dài tối đa 1000 ký tự.",
  ],
  [
    "a kit on a sale",
    (f) => ({ ...kgSale(f), kits: [{ kitId: f.kit("BO-17"), quantity: 1 }] }),
    "kits",
    "Hợp đồng bán chọn từng mã hàng, không chọn theo bộ.",
  ],
  [
    "an unknown item",
    (f) => ({
      ...d5Rental(f),
      lines: [
        { itemId: "00000000-0000-4000-8000-000000000000", quantity: "1" },
      ],
    }),
    "lines.0.itemId",
    "Chọn mã hàng",
  ],
  [
    "a decimal rental price",
    (f) => ({
      ...d5Rental(f),
      lines: [{ itemId: f.item("PK-KU"), quantity: "400", price: 450.5 }],
    }),
    "lines.0.price",
    "Giá phải là số nguyên từ 0 ₫ trở lên.",
  ],
  [
    "a negative compensation",
    (f) => ({
      ...d5Rental(f),
      compensations: [{ itemId: f.item("PK-KU"), lostPrice: -1 }],
    }),
    (f) => `compensations.${f.item("PK-KU")}.lostPrice`,
    "Giá phải là số nguyên từ 0 ₫ trở lên.",
  ],
  [
    "a cash deposit of 0 ₫",
    (f) => ({
      ...d5Rental(f),
      deposits: [{ kind: "CASH", amount: 0, method: "CASH" }],
    }),
    "deposits.0.amount",
    "Số tiền cọc phải lớn hơn 0 ₫.",
  ],
  [
    "a cash deposit without method",
    (f) => ({ ...d5Rental(f), deposits: [{ kind: "CASH", amount: 1 }] }),
    "deposits.0.method",
    "Chọn hình thức cọc (tiền mặt hoặc chuyển khoản).",
  ],
  [
    "a guarantee without number",
    (f) => ({
      ...d5Rental(f),
      deposits: [
        {
          kind: "GUARANTEE",
          amount: 1,
          bankName: "VCB",
          expiryDate: "2027-03-31",
        },
      ],
    }),
    "deposits.0",
    "Bảo lãnh cần ngân hàng, số chứng thư, giá trị và ngày hết hạn.",
  ],
  [
    "a deposit of no kind",
    (f) => ({ ...d5Rental(f), deposits: [{ kind: "GOLD", amount: 1 }] }),
    "deposits.0.kind",
    "Chọn loại cọc (cọc tiền hoặc bảo lãnh).",
  ],
  [
    "a batch without date",
    (f) => ({ ...d5Rental(f), batches: [{ plannedDate: "", lines: [] }] }),
    "batches.0.plannedDate",
    "Ngày không hợp lệ (dd/mm/yyyy).",
  ],
  [
    "a long batch note",
    (f) => ({
      ...d5Rental(f),
      batches: [
        { plannedDate: "2026-11-01", note: "x".repeat(201), lines: [] },
      ],
    }),
    "batches.0.note",
    "Ghi chú đợt giao dài tối đa 200 ký tự.",
  ],
  [
    "a batch line with both a kit and an item",
    (f) => ({
      ...d5Rental(f),
      batches: [
        {
          plannedDate: "2026-11-01",
          lines: [
            { kitId: f.kit("BO-17"), itemId: f.item("PK-KU"), quantity: "1" },
          ],
        },
      ],
    }),
    "batches.0.lines.0",
    "Mỗi dòng của đợt giao chọn một bộ hoặc một mã hàng.",
  ],
  [
    "a batch item not on the contract",
    (f) => ({
      ...d5Rental(f),
      batches: [
        {
          plannedDate: "2026-11-01",
          lines: [{ itemId: f.item("OT-06"), quantity: "1" }],
        },
      ],
    }),
    "batches.0.lines.0",
    "Mã OT-06 chưa có trên hợp đồng. Bạn thêm dòng hàng trước.",
  ],
  [
    "a batch kit not on the contract",
    (f) => ({
      ...d5Rental(f),
      kits: [],
      lines: [{ itemId: f.item("PK-KU"), quantity: "400" }],
      batches: [
        {
          plannedDate: "2026-11-01",
          lines: [{ kitId: f.kit("BO-17"), quantity: "1" }],
        },
      ],
    }),
    "batches.0.lines.0",
    "Bộ BO-17 chưa có trên hợp đồng. Bạn thêm bộ trước.",
  ],
  [
    "a batch of 0 pieces",
    (f) => ({
      ...d5Rental(f),
      batches: [
        {
          plannedDate: "2026-11-01",
          lines: [{ itemId: f.item("PK-KU"), quantity: "0" }],
        },
      ],
    }),
    "batches.0.lines.0.quantity",
    "Số lượng phải lớn hơn 0. Bạn bỏ dòng nếu không thuê mã này.",
  ],
  [
    "a sale line twice",
    (f) => ({
      ...kgSale(f),
      lines: [...(kgSale(f).lines ?? []), ...(kgSale(f).lines ?? [])],
    }),
    "lines.1.itemId",
    "Mã GG-K17 đã có dòng trên hợp đồng. Bạn sửa số lượng ở dòng đó.",
  ],
  [
    "scrap sold by the piece",
    (f) => ({
      ...kgSale(f),
      lines: [
        {
          itemId: f.item("GG-K17"),
          condition: "SCRAP",
          pricingUnit: "ITEM",
          quantity: "10",
        },
      ],
    }),
    "lines.0.condition",
    "Phế liệu chỉ bán theo kg.",
  ],
  [
    "a sale of 0 kg",
    (f) => ({
      ...kgSale(f),
      lines: [
        {
          itemId: f.item("GG-K17"),
          condition: "GOOD",
          pricingUnit: "KG",
          quantity: "0",
        },
      ],
    }),
    "lines.0.quantity",
    "Số lượng phải lớn hơn 0. Bạn bỏ dòng nếu không thuê mã này.",
  ],
];

describe("checkContent and checkTerms", () => {
  it.each(CASES)("refuses %s", async (_name, body, field, error) => {
    expect(await save(body(fx))).toMatchObject({
      ok: false,
      status: 422,
      field: typeof field === "string" ? field : field(fx),
      error,
    });
  });

  it("refuses an archived item and an archived kit", async () => {
    await ctx.db
      .update(item)
      .set({ status: "ARCHIVED" })
      .where(eq(item.id, fx.item("PK-KU")));
    expect(await save(d5Rental(fx))).toMatchObject({
      ok: false,
      error: "Mã PK-KU đã ngừng dùng.",
    });
    await ctx.db
      .update(item)
      .set({ status: "ACTIVE" })
      .where(eq(item.id, fx.item("PK-KU")));
    await ctx.db
      .update(kit)
      .set({ status: "ARCHIVED" })
      .where(eq(kit.id, fx.kit("BO-17")));
    expect(await save(d5Rental(fx))).toMatchObject({
      ok: false,
      error: "Bộ BO-17 đã ngừng dùng.",
    });
  });

  it("keeps a sale's price when the line is sent again without it", async () => {
    const saved = await save(kgSale(fx));
    if (!saved.ok) throw new Error(saved.error);
    const { updateContract } = await import("./service");
    const again = await updateContract(ctx.db, fx.sales, saved.data.id, {
      ...kgSale(fx),
      lines: [
        {
          itemId: fx.item("GG-K17"),
          condition: "GOOD",
          pricingUnit: "KG",
          quantity: "1250.500",
        },
      ],
      updatedAt: saved.data.updatedAt,
    });
    expect(again.ok).toBe(true);
    const { readRevisions } = await import("./records");
    const { readContent } = await import("./content");
    const [revision] = await readRevisions(ctx.db, saved.data.id);
    const content = await readContent(ctx.db, revision?.id ?? "");
    expect(content.lines[0]).toMatchObject({
      price: 14_000,
      quantity: "1250.500",
    });
  });

  it("stores VAT 8 % and the freight of the company truck", async () => {
    const saved = await save({
      ...d5Rental(fx),
      vatEnabled: true,
      vatRate: "8",
      companyTruck: true,
      freightPerTrip: 1_800_000,
    });
    if (!saved.ok) throw new Error(saved.error);
    const { readRevisions } = await import("./records");
    const [revision] = await readRevisions(ctx.db, saved.data.id);
    expect(revision).toMatchObject({
      vatEnabled: true,
      vatRate: "8.00",
      companyTruck: true,
      freightPerTrip: 1_800_000,
    });
  });
});
