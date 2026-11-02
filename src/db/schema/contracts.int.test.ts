import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { resetCatalogTables } from "@/test/catalog";
import { resetInventoryTables, truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";
import { customer, item, itemGroup, location, site } from "./catalog";
import {
  contract,
  contractDeposit,
  contractLine,
  contractRevision,
} from "./contracts";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

// The app role (erp_app), as the app runs.
const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

const userId = "contract-schema-user";
let customerId = "";
let siteId = "";
let itemId = "";

beforeEach(async () => {
  await truncateWithLedger(sql`truncate table "user" cascade`);
  await resetInventoryTables();
  await resetCatalogTables();
  await db.insert(user).values({
    id: userId,
    name: "Quốc Bảo",
    email: "quocbao@users.invalid",
    username: "quocbao",
    role: "SALES",
  });
  const [buyer] = await db
    .insert(customer)
    .values({
      code: "NT-0003",
      kind: "COMPANY",
      name: "Cty TNHH Xây dựng Minh Phát",
      searchText: "minh phat nt-0003",
    })
    .returning({ id: customer.id });
  customerId = buyer?.id ?? "";
  const [place] = await db
    .insert(location)
    .values({ code: "CT-0003", name: "Trường THCS Dương Nội", type: "SITE" })
    .returning({ id: location.id });
  const [work] = await db
    .insert(site)
    .values({
      code: "CT-0003",
      name: "Trường THCS Dương Nội",
      customerId,
      locationId: place?.id ?? "",
      searchText: "duong noi ct-0003",
    })
    .returning({ id: site.id });
  siteId = work?.id ?? "";
  const [group] = await db
    .insert(itemGroup)
    .values({ name: "Giàn giáo", nameKey: "gian giao" })
    .returning({ id: itemGroup.id });
  const [row] = await db
    .insert(item)
    .values({
      code: "H1,7",
      name: "Khung giàn giáo 1,7m",
      groupId: group?.id ?? "",
      unit: "PIECE",
      standardWeightKg: "13.500",
      searchText: "khung gian giao h1,7",
    })
    .returning({ id: item.id });
  itemId = row?.id ?? "";
});

type ContractValues = Partial<typeof contract.$inferInsert>;
type RevisionValues = Partial<typeof contractRevision.$inferInsert>;

async function insertContract(values: ContractValues = {}) {
  const [row] = await db
    .insert(contract)
    .values({
      code: "112026/ANPHAT-MINHPHAT",
      type: "RENTAL",
      customerId,
      siteId,
      customerToken: "MINHPHAT",
      createdBy: userId,
      ...values,
    })
    .returning({ id: contract.id });
  return row?.id ?? "";
}

async function insertRevision(contractId: string, values: RevisionValues = {}) {
  const [row] = await db
    .insert(contractRevision)
    .values({
      contractId,
      number: 0,
      kind: "ORIGINAL",
      code: "112026/ANPHAT-MINHPHAT",
      effectiveFrom: "2026-11-01",
      startDate: "2026-11-01",
      endDate: "2027-03-21",
      minRentalDays: 45,
      billingCycle: "MONTH_END",
      paymentTermsDays: 30,
      createdBy: userId,
      ...values,
    })
    .returning({ id: contractRevision.id });
  return row?.id ?? "";
}

async function insertLine(revisionId: string) {
  const [row] = await db
    .insert(contractLine)
    .values({
      revisionId,
      lineNo: 1,
      itemId,
      ownQuantity: "600",
      quantity: "600",
      price: 1200,
      catalogPrice: 1200,
    })
    .returning({ id: contractLine.id });
  return row?.id ?? "";
}

/** The approval itself: PENDING -> APPROVED with who and the reason. */
async function approve(revisionId: string) {
  await db
    .update(contractRevision)
    .set({
      status: "APPROVED",
      approvedBy: userId,
      approvedAt: new Date(),
      approvalReason: "Minh Phát hẹn trả trước 05/11",
      overdueAmount: 96_000_000,
      overdueDays: 7,
    })
    .where(eq(contractRevision.id, revisionId));
}

describe("contract tables", () => {
  it("lets the approval itself through, then freezes the revision", async () => {
    const contractId = await insertContract();
    const revisionId = await insertRevision(contractId, { status: "PENDING" });
    await insertLine(revisionId);
    await approve(revisionId);
    const [row] = await db
      .select({ status: contractRevision.status })
      .from(contractRevision)
      .where(eq(contractRevision.id, revisionId));
    expect(row?.status).toBe("APPROVED");
    await expect(
      db
        .update(contractRevision)
        .set({ approvalReason: "Sửa lý do sau khi duyệt" })
        .where(eq(contractRevision.id, revisionId)),
    ).rejects.toThrow();
  });

  it("refuses to change a line or drop a deposit of an approved revision", async () => {
    const contractId = await insertContract();
    const revisionId = await insertRevision(contractId, { status: "PENDING" });
    const lineId = await insertLine(revisionId);
    await db.insert(contractDeposit).values({
      revisionId,
      lineNo: 1,
      kind: "CASH",
      amount: 50_000_000,
      method: "TRANSFER",
    });
    await approve(revisionId);
    await expect(
      db
        .update(contractLine)
        .set({ price: 1300 })
        .where(eq(contractLine.id, lineId)),
    ).rejects.toThrow();
    await expect(
      db
        .delete(contractDeposit)
        .where(eq(contractDeposit.revisionId, revisionId)),
    ).rejects.toThrow();
  });

  it("lets a draft revision's lines change", async () => {
    const contractId = await insertContract();
    const revisionId = await insertRevision(contractId);
    const lineId = await insertLine(revisionId);
    await db
      .update(contractLine)
      .set({ price: 1300 })
      .where(eq(contractLine.id, lineId));
    await db.delete(contractLine).where(eq(contractLine.id, lineId));
  });

  it("still lets the contract move on after approval", async () => {
    const contractId = await insertContract({ status: "APPROVED" });
    const revisionId = await insertRevision(contractId, { status: "PENDING" });
    await approve(revisionId);
    await db
      .update(contract)
      .set({ status: "ACTIVE" })
      .where(eq(contract.id, contractId));
  });

  it("refuses a rental contract without a site", async () => {
    await expect(insertContract({ siteId: null })).rejects.toThrow();
    await insertContract({ type: "SALE", siteId: null });
  });

  it("refuses two open amendments of one contract", async () => {
    const contractId = await insertContract({ status: "APPROVED" });
    await insertRevision(contractId, {
      number: 1,
      kind: "AMENDMENT",
      code: "112026/ANPHAT-MINHPHAT/01",
      effectiveFrom: "2026-12-15",
    });
    await expect(
      insertRevision(contractId, {
        number: 2,
        kind: "AMENDMENT",
        code: "112026/ANPHAT-MINHPHAT/02",
        effectiveFrom: "2026-12-20",
      }),
    ).rejects.toThrow();
  });

  it("refuses VAT on without a rate", async () => {
    const contractId = await insertContract();
    await expect(
      insertRevision(contractId, { vatEnabled: true, vatRate: null }),
    ).rejects.toThrow();
    await insertRevision(contractId, { vatEnabled: true, vatRate: "8" });
  });

  it("refuses a guarantee without its certificate number", async () => {
    const contractId = await insertContract();
    const revisionId = await insertRevision(contractId);
    await expect(
      db.insert(contractDeposit).values({
        revisionId,
        lineNo: 1,
        kind: "GUARANTEE",
        amount: 100_000_000,
        bankName: "Vietcombank",
        expiryDate: "2027-03-31",
      }),
    ).rejects.toThrow();
  });

  it("refuses scrap sold by the piece", async () => {
    const contractId = await insertContract({ type: "SALE", siteId: null });
    const revisionId = await insertRevision(contractId, {
      endDate: null,
      minRentalDays: null,
      billingCycle: null,
    });
    await expect(
      db.insert(contractLine).values({
        revisionId,
        lineNo: 1,
        itemId,
        condition: "SCRAP",
        pricingUnit: "ITEM",
        quantity: "10",
        price: 50_000,
      }),
    ).rejects.toThrow();
  });
});
