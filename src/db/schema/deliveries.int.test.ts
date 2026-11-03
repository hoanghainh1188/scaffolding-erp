import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { resetCatalogTables } from "@/test/catalog";
import { resetInventoryTables, truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";
import { customer, item, itemGroup, location, site } from "./catalog";
import { contract, contractRevision } from "./contracts";
import { deliveryNote, deliveryNoteLine, deliveryNotePick } from "./deliveries";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

// The app role (erp_app), as the app runs.
const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

const userId = "delivery-schema-user";
let contractId = "";
let revisionId = "";
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
});

type NoteValues = Partial<typeof deliveryNote.$inferInsert>;

async function insertNote(values: NoteValues = {}) {
  const [row] = await db
    .insert(deliveryNote)
    .values({
      code: "PX-2026-001",
      contractId,
      batchNo: 1,
      sourceLocationId: yardId,
      siteLocationId,
      createdBy: userId,
      ...values,
    })
    .returning({ id: deliveryNote.id });
  return row?.id ?? "";
}

async function insertLine(noteId: string) {
  const [row] = await db
    .insert(deliveryNoteLine)
    .values({ noteId, lineNo: 1, itemId, requestedQuantity: "120" })
    .returning({ id: deliveryNoteLine.id });
  return row?.id ?? "";
}

const posted = () => ({
  status: "POSTED",
  businessDate: "2026-11-03",
  postingId: "6a1f4c3e-0f6b-4a46-9a2b-7a3d6c0e5b11",
  clientDraftId: "b8f0d2a4-3c1e-4f5d-8a9b-0c1d2e3f4a5b",
  postedBy: userId,
  postedAt: new Date(),
  contractRevisionId: revisionId,
});

async function startPicking(noteId: string) {
  await db
    .update(deliveryNote)
    .set({
      status: "PICKING",
      pickingBy: userId,
      pickingStartedAt: new Date(),
    })
    .where(eq(deliveryNote.id, noteId));
}

describe("delivery note tables", () => {
  it("lets posting through, then freezes the note and its rows", async () => {
    const noteId = await insertNote();
    const lineId = await insertLine(noteId);
    await startPicking(noteId);
    await db
      .insert(deliveryNotePick)
      .values({ lineId, condition: "GOOD", quantity: "120" });
    await db
      .update(deliveryNote)
      .set(posted())
      .where(eq(deliveryNote.id, noteId));
    await expect(
      db
        .update(deliveryNoteLine)
        .set({ requestedQuantity: "200" })
        .where(eq(deliveryNoteLine.id, lineId)),
    ).rejects.toThrow();
    await expect(
      db.delete(deliveryNotePick).where(eq(deliveryNotePick.lineId, lineId)),
    ).rejects.toThrow();
    await expect(
      db
        .update(deliveryNote)
        .set({ vehiclePlate: "51X-000.02" })
        .where(eq(deliveryNote.id, noteId)),
    ).rejects.toThrow();
  });

  it("freezes a cancelled note", async () => {
    const noteId = await insertNote();
    await db
      .update(deliveryNote)
      .set({ status: "CANCELLED", cancelledReason: "Công trình dời lịch" })
      .where(eq(deliveryNote.id, noteId));
    await expect(insertLine(noteId)).rejects.toThrow();
  });

  it("lets a planned note change", async () => {
    const noteId = await insertNote();
    const lineId = await insertLine(noteId);
    await db
      .update(deliveryNoteLine)
      .set({ requestedQuantity: "100" })
      .where(eq(deliveryNoteLine.id, lineId));
    const [row] = await db
      .select({ quantity: deliveryNoteLine.requestedQuantity })
      .from(deliveryNoteLine)
      .where(eq(deliveryNoteLine.id, lineId));
    expect(row?.quantity).toBe("100.000");
  });

  it("refuses a posted note without its draft id", async () => {
    const noteId = await insertNote();
    await startPicking(noteId);
    await expect(
      db
        .update(deliveryNote)
        .set({ ...posted(), clientDraftId: null })
        .where(eq(deliveryNote.id, noteId)),
    ).rejects.toThrow();
  });

  it("refuses two notes with one draft id", async () => {
    const draft = "b8f0d2a4-3c1e-4f5d-8a9b-0c1d2e3f4a5b";
    await insertNote({ clientDraftId: draft });
    await expect(
      insertNote({ code: "PX-2026-002", batchNo: 2, clientDraftId: draft }),
    ).rejects.toThrow();
  });

  it("refuses freight when the company does not call the truck", async () => {
    await expect(
      insertNote({ companyTruck: false, freightAmount: 1_800_000 }),
    ).rejects.toThrow();
    await insertNote({ companyTruck: true, freightAmount: 1_800_000 });
  });

  it("refuses two notes with one batch number of a contract", async () => {
    await insertNote();
    await expect(insertNote({ code: "PX-2026-002" })).rejects.toThrow();
  });
});
