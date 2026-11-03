import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { resetCatalogTables } from "@/test/catalog";
import { resetInventoryTables, truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";
import { customer, item, itemGroup, location, site } from "./catalog";
import { contract, contractRevision } from "./contracts";
import { deliveryNote } from "./deliveries";
import { returnNote } from "./returns";
import {
  buyBackNote,
  buyBackNoteLine,
  deliveryExchange,
  deliveryExchangeLine,
  siteTransfer,
  siteTransferLine,
} from "./site-operations";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

// The app role (erp_app), as the app runs.
const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

const userId = "site-ops-schema-user";
let contractId = "";
let revisionId = "";
let otherContractId = "";
let otherSiteLocationId = "";
let yardId = "";
let siteLocationId = "";
let itemId = "";

beforeEach(async () => {
  await truncateWithLedger(sql`truncate table "user" cascade`);
  await resetInventoryTables();
  await resetCatalogTables();
  await db.insert(user).values({
    id: userId,
    name: "Văn Tùng",
    email: "vantung@users.invalid",
    username: "vantung",
    role: "WAREHOUSE",
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
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  yardId = yard?.id ?? "";
  const [place] = await db
    .insert(location)
    .values({ code: "CT-0003", name: "Trường THCS Dương Nội", type: "SITE" })
    .returning({ id: location.id });
  siteLocationId = place?.id ?? "";
  const [work] = await db
    .insert(site)
    .values({
      code: "CT-0003",
      name: "Trường THCS Dương Nội",
      customerId: buyer?.id ?? "",
      locationId: siteLocationId,
      searchText: "duong noi ct-0003",
    })
    .returning({ id: site.id });
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
      standardWeightKg: "13.600",
      searchText: "khung gian giao h1,7",
    })
    .returning({ id: item.id });
  itemId = row?.id ?? "";
  const [deal] = await db
    .insert(contract)
    .values({
      code: "112026/ANPHAT-MINHPHAT",
      type: "RENTAL",
      customerId: buyer?.id ?? "",
      siteId: work?.id ?? "",
      status: "APPROVED",
      customerToken: "MINHPHAT",
      createdBy: userId,
    })
    .returning({ id: contract.id });
  contractId = deal?.id ?? "";
  const [rev] = await db
    .insert(contractRevision)
    .values({
      contractId,
      number: 0,
      kind: "ORIGINAL",
      code: "112026/ANPHAT-MINHPHAT",
      status: "APPROVED",
      effectiveFrom: "2026-11-01",
      startDate: "2026-11-01",
      endDate: "2027-03-21",
      minRentalDays: 45,
      paymentTermsDays: 30,
      approvedBy: userId,
      approvedAt: new Date(),
      createdBy: userId,
    })
    .returning({ id: contractRevision.id });
  revisionId = rev?.id ?? "";
  const [place2] = await db
    .insert(location)
    .values({
      code: "CT-0004",
      name: "Chung cư An Phú – Block B",
      type: "SITE",
    })
    .returning({ id: location.id });
  otherSiteLocationId = place2?.id ?? "";
  const [work2] = await db
    .insert(site)
    .values({
      code: "CT-0004",
      name: "Chung cư An Phú – Block B",
      customerId: buyer?.id ?? "",
      locationId: otherSiteLocationId,
      searchText: "an phu ct-0004",
    })
    .returning({ id: site.id });
  const [deal2] = await db
    .insert(contract)
    .values({
      code: "102026/ANPHAT-MINHPHAT",
      type: "RENTAL",
      customerId: buyer?.id ?? "",
      siteId: work2?.id ?? "",
      status: "ACTIVE",
      customerToken: "MINHPHAT",
      createdBy: userId,
    })
    .returning({ id: contract.id });
  otherContractId = deal2?.id ?? "";
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function draftTransfer(): Promise<string> {
  const [row] = await db
    .insert(siteTransfer)
    .values({
      code: "CCT-2026-004",
      fromContractId: otherContractId,
      toContractId: contractId,
      fromSiteLocationId: otherSiteLocationId,
      toSiteLocationId: siteLocationId,
      createdBy: userId,
    })
    .returning({ id: siteTransfer.id });
  const id = row?.id ?? "";
  await db
    .insert(siteTransferLine)
    .values({ transferId: id, lineNo: 1, itemId, plannedQuantity: "50" });
  return id;
}

/** Posts the transfer the way postSiteTransfer does: parent, then lines. */
async function post(tx: Tx | typeof db, id: string, moved = "50") {
  await tx
    .update(siteTransfer)
    .set({
      status: "POSTED",
      businessDate: "2026-11-05",
      postingId: crypto.randomUUID(),
      postedBy: userId,
      // A time far from the database clock: the triggers must not read it.
      postedAt: new Date("2020-01-01T00:00:00Z"),
      postedXact: sql`pg_current_xact_id()`,
      sameCustomer: true,
    })
    .where(eq(siteTransfer.id, id));
  await tx
    .update(siteTransferLine)
    .set({ movedQuantity: moved })
    .where(eq(siteTransferLine.transferId, id));
}

describe("site transfer tables", () => {
  it("lets a draft and its lines change", async () => {
    const id = await draftTransfer();
    await db
      .update(siteTransferLine)
      .set({ plannedQuantity: "40" })
      .where(eq(siteTransferLine.transferId, id));
    await db
      .delete(siteTransferLine)
      .where(eq(siteTransferLine.transferId, id));
    await db
      .update(siteTransfer)
      .set({ vehiclePlate: "29C-456.78" })
      .where(eq(siteTransfer.id, id));
  });

  it("freezes the lines of a sent transfer", async () => {
    const id = await draftTransfer();
    await db
      .update(siteTransfer)
      .set({ status: "SENT", confirmMode: "PHONE" })
      .where(eq(siteTransfer.id, id));
    await expect(
      db
        .update(siteTransferLine)
        .set({ plannedQuantity: "40" })
        .where(eq(siteTransferLine.transferId, id)),
    ).rejects.toThrow();
  });

  it("writes moved quantities only in the posting transaction", async () => {
    const id = await draftTransfer();
    await db.transaction((tx) => post(tx, id, "46"));
    const [row] = await db
      .select({ moved: siteTransferLine.movedQuantity })
      .from(siteTransferLine)
      .where(eq(siteTransferLine.transferId, id));
    expect(row?.moved).toBe("46.000");
    await expect(
      db
        .update(siteTransferLine)
        .set({ movedQuantity: "40" })
        .where(eq(siteTransferLine.transferId, id)),
    ).rejects.toThrow();
  });

  it("refuses other columns of a line in the posting transaction", async () => {
    const id = await draftTransfer();
    await expect(
      db.transaction(async (tx) => {
        await post(tx, id);
        await tx
          .update(siteTransferLine)
          .set({ plannedQuantity: "60" })
          .where(eq(siteTransferLine.transferId, id));
      }),
    ).rejects.toThrow();
  });

  it("freezes a posted or cancelled transfer", async () => {
    const id = await draftTransfer();
    await db.transaction((tx) => post(tx, id));
    await expect(
      db
        .update(siteTransfer)
        .set({ note: "Sửa sau" })
        .where(eq(siteTransfer.id, id)),
    ).rejects.toThrow();
    await expect(
      db.delete(siteTransfer).where(eq(siteTransfer.id, id)),
    ).rejects.toThrow();
  });

  it("checks moved against planned and the two contracts", async () => {
    const id = await draftTransfer();
    await expect(db.transaction((tx) => post(tx, id, "55"))).rejects.toThrow();
    await expect(
      db.insert(siteTransfer).values({
        code: "CCT-2026-005",
        fromContractId: contractId,
        toContractId: contractId,
        fromSiteLocationId: siteLocationId,
        toSiteLocationId: siteLocationId,
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });
});

async function pendingBuyBack(): Promise<string> {
  const [row] = await db
    .insert(buyBackNote)
    .values({
      code: "MLA-2026-003",
      contractId,
      siteLocationId,
      revisionId,
      reason: "Ty ren đã đổ bê tông",
      createdBy: userId,
    })
    .returning({ id: buyBackNote.id });
  const id = row?.id ?? "";
  await db.insert(buyBackNoteLine).values({
    noteId: id,
    lineNo: 1,
    itemId,
    quantity: "20",
    unitPrice: 35_000,
    contractPrice: 35_000,
  });
  return id;
}

describe("buy-back tables", () => {
  it("lets a pending note change, then freezes it", async () => {
    const id = await pendingBuyBack();
    await db
      .update(buyBackNoteLine)
      .set({ unitPrice: 30_000 })
      .where(eq(buyBackNoteLine.noteId, id));
    await db
      .update(buyBackNote)
      .set({
        status: "APPROVED",
        amountDue: 600_000,
        approvedBy: userId,
        approvedAt: new Date(),
        approvedDate: "2026-11-05",
        dueDate: "2026-12-05",
        postingId: crypto.randomUUID(),
      })
      .where(eq(buyBackNote.id, id));
    await expect(
      db
        .update(buyBackNoteLine)
        .set({ unitPrice: 1 })
        .where(eq(buyBackNoteLine.noteId, id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(buyBackNote)
        .set({ reason: "Khác" })
        .where(eq(buyBackNote.id, id)),
    ).rejects.toThrow();
  });

  it("needs the amount to approve", async () => {
    const id = await pendingBuyBack();
    await expect(
      db
        .update(buyBackNote)
        .set({ status: "APPROVED" })
        .where(eq(buyBackNote.id, id)),
    ).rejects.toThrow();
  });

  it("freezes a rejected note", async () => {
    const id = await pendingBuyBack();
    await db
      .update(buyBackNote)
      .set({
        status: "REJECTED",
        rejectedReason: "Cho trả về",
        rejectedBy: userId,
        rejectedAt: new Date(),
      })
      .where(eq(buyBackNote.id, id));
    await expect(
      db.delete(buyBackNoteLine).where(eq(buyBackNoteLine.noteId, id)),
    ).rejects.toThrow();
  });
});

async function delivery(batchNo: number): Promise<string> {
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  const [row] = await db
    .insert(deliveryNote)
    .values({
      code: `PX-2026-15${batchNo}`,
      contractId,
      batchNo,
      sourceLocationId: yard?.id ?? "",
      siteLocationId,
      createdBy: userId,
    })
    .returning({ id: deliveryNote.id });
  return row?.id ?? "";
}

async function returned(code: string): Promise<string> {
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  const [row] = await db
    .insert(returnNote)
    .values({
      code,
      contractId,
      siteLocationId,
      yardLocationId: yard?.id ?? "",
      businessDate: "2026-11-06",
      clientDraftId: crypto.randomUUID(),
      postingId: crypto.randomUUID(),
      postedBy: userId,
      postedAt: new Date(),
    })
    .returning({ id: returnNote.id });
  return row?.id ?? "";
}

async function waiting(deliveryNoteId: string): Promise<string> {
  const [row] = await db
    .insert(deliveryExchange)
    .values({ contractId, deliveryNoteId, createdBy: userId })
    .returning({ id: deliveryExchange.id });
  const id = row?.id ?? "";
  await db.insert(deliveryExchangeLine).values({
    exchangeId: id,
    lineNo: 1,
    itemId,
    expectedQuantity: "100",
  });
  return id;
}

describe("delivery exchange tables", () => {
  it("needs the return note to be done, then freezes", async () => {
    const id = await waiting(await delivery(4));
    await expect(
      db
        .update(deliveryExchange)
        .set({ status: "DONE" })
        .where(eq(deliveryExchange.id, id)),
    ).rejects.toThrow();
    const returnId = await returned("PTH-2026-080");
    await db
      .update(deliveryExchange)
      .set({ status: "DONE", returnNoteId: returnId })
      .where(eq(deliveryExchange.id, id));
    await expect(
      db
        .update(deliveryExchange)
        .set({ status: "CANCELLED", cancelledReason: "Bỏ" })
        .where(eq(deliveryExchange.id, id)),
    ).rejects.toThrow();
  });

  it("links one delivery and one return note to one exchange", async () => {
    const deliveryId = await delivery(4);
    await waiting(deliveryId);
    await expect(waiting(deliveryId)).rejects.toThrow();
    const other = await waiting(await delivery(5));
    const first = await waiting(await delivery(6));
    const returnId = await returned("PTH-2026-081");
    await db
      .update(deliveryExchange)
      .set({ status: "DONE", returnNoteId: returnId })
      .where(eq(deliveryExchange.id, first));
    await expect(
      db
        .update(deliveryExchange)
        .set({ status: "DONE", returnNoteId: returnId })
        .where(eq(deliveryExchange.id, other)),
    ).rejects.toThrow();
  });

  it("never changes the expected lines", async () => {
    const id = await waiting(await delivery(4));
    await expect(
      db
        .update(deliveryExchangeLine)
        .set({ expectedQuantity: "90" })
        .where(eq(deliveryExchangeLine.exchangeId, id)),
    ).rejects.toThrow();
  });

  it("needs a reason to cancel", async () => {
    const id = await waiting(await delivery(4));
    await expect(
      db
        .update(deliveryExchange)
        .set({ status: "CANCELLED" })
        .where(eq(deliveryExchange.id, id)),
    ).rejects.toThrow();
  });
});
