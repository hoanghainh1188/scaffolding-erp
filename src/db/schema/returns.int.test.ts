import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { resetCatalogTables } from "@/test/catalog";
import { resetInventoryTables, truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";
import { customer, item, itemGroup, location, site } from "./catalog";
import { contract, contractRevision } from "./contracts";
import { inventoryLedger } from "./inventory";
import {
  compensationNote,
  compensationNoteLine,
  returnNote,
  returnNoteLine,
  returnPhoto,
} from "./returns";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

// The app role (erp_app), as the app runs.
const handle = createDatabase(url);
const { db } = handle;

afterAll(handle.close);

const userId = "return-schema-user";
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

const DRAFT = "b8f0d2a4-3c1e-4f5d-8a9b-0c1d2e3f4a5b";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertNote(tx: Tx | typeof db = db, code = "PTH-2026-001") {
  const [row] = await tx
    .insert(returnNote)
    .values({
      code,
      contractId,
      siteLocationId,
      yardLocationId: yardId,
      businessDate: "2026-11-05",
      clientDraftId: code === "PTH-2026-001" ? DRAFT : crypto.randomUUID(),
      postingId: crypto.randomUUID(),
      postedBy: userId,
      // A time far from the database clock: the triggers must not read it.
      postedAt: new Date("2020-01-01T00:00:00Z"),
    })
    .returning({ id: returnNote.id });
  return row?.id ?? "";
}

const line = (noteId: string) => ({
  noteId,
  lineNo: 1,
  itemId,
  goodQuantity: "80",
  repairQuantity: "15",
});

/** A posted note with one line, in its own transaction. */
async function postedNote() {
  return db.transaction(async (tx) => {
    const noteId = await insertNote(tx);
    await tx.insert(returnNoteLine).values(line(noteId));
    return noteId;
  });
}

async function insertCompensation(tx: Tx | typeof db, returnNoteId: string) {
  const [row] = await tx
    .insert(compensationNote)
    .values({ code: "ĐB-2026-001", returnNoteId, contractId, revisionId })
    .returning({ id: compensationNote.id });
  return row?.id ?? "";
}

async function pendingCompensation() {
  const returnId = await postedNote();
  return db.transaction(async (tx) => {
    const noteId = await insertCompensation(tx, returnId);
    await tx.insert(compensationNoteLine).values({
      noteId,
      itemId,
      kind: "DAMAGED",
      quantity: "15",
      unitPrice: 50_000,
      contractPrice: 50_000,
    });
    return { returnId, noteId };
  });
}

async function insertPhoto(returnNoteId: string | null = null) {
  const [row] = await db
    .insert(returnPhoto)
    .values({
      clientDraftId: DRAFT,
      clientPhotoId: crypto.randomUUID(),
      returnNoteId,
      content: Buffer.from("RIFF0000WEBP"),
      byteSize: 12,
      width: 1280,
      height: 960,
      uploadedBy: userId,
    })
    .returning({ id: returnPhoto.id });
  return row?.id ?? "";
}

const approved = () => ({
  status: "APPROVED",
  amountDue: 750_000,
  approvedBy: userId,
  approvedAt: new Date(),
  approvedDate: "2026-11-06",
  dueDate: "2026-12-06",
});

describe("return note tables", () => {
  it("freezes a return note and its lines", async () => {
    const noteId = await postedNote();
    await expect(
      db
        .update(returnNote)
        .set({ vehiclePlate: "29C-456.78" })
        .where(eq(returnNote.id, noteId)),
    ).rejects.toThrow();
    await expect(
      db.delete(returnNote).where(eq(returnNote.id, noteId)),
    ).rejects.toThrow();
    await expect(
      db
        .update(returnNoteLine)
        .set({ goodQuantity: "90" })
        .where(eq(returnNoteLine.noteId, noteId)),
    ).rejects.toThrow();
    await expect(
      db.delete(returnNoteLine).where(eq(returnNoteLine.noteId, noteId)),
    ).rejects.toThrow();
  });

  it("refuses a line added in another transaction, whatever posted_at says", async () => {
    const noteId = await postedNote();
    await expect(
      db.insert(returnNoteLine).values({ ...line(noteId), itemId, lineNo: 2 }),
    ).rejects.toThrow();
  });

  it("refuses a line with nothing returned or lost", async () => {
    await expect(
      db.transaction(async (tx) => {
        const noteId = await insertNote(tx);
        await tx.insert(returnNoteLine).values({ noteId, lineNo: 1, itemId });
      }),
    ).rejects.toThrow();
  });

  it("freezes an approved compensation note and its lines", async () => {
    const { noteId } = await pendingCompensation();
    await db
      .update(compensationNoteLine)
      .set({ unitPrice: 45_000 })
      .where(eq(compensationNoteLine.noteId, noteId));
    await db
      .update(compensationNote)
      .set(approved())
      .where(eq(compensationNote.id, noteId));
    await expect(
      db
        .update(compensationNote)
        .set({ discountAmount: 50_000, discountReason: "Khách quen" })
        .where(eq(compensationNote.id, noteId)),
    ).rejects.toThrow();
    await expect(
      db
        .update(compensationNoteLine)
        .set({ unitPrice: 40_000 })
        .where(eq(compensationNoteLine.noteId, noteId)),
    ).rejects.toThrow();
  });

  it("lets a pending line change only its price", async () => {
    const { noteId } = await pendingCompensation();
    await expect(
      db
        .update(compensationNoteLine)
        .set({ quantity: "20" })
        .where(eq(compensationNoteLine.noteId, noteId)),
    ).rejects.toThrow();
    await expect(
      db
        .delete(compensationNoteLine)
        .where(eq(compensationNoteLine.noteId, noteId)),
    ).rejects.toThrow();
    await expect(
      db.insert(compensationNoteLine).values({
        noteId,
        itemId,
        kind: "LOST",
        quantity: "2",
      }),
    ).rejects.toThrow();
  });

  it("refuses an approved note without its amount, a discount without reason", async () => {
    const { noteId } = await pendingCompensation();
    await expect(
      db
        .update(compensationNote)
        .set({ ...approved(), amountDue: null })
        .where(eq(compensationNote.id, noteId)),
    ).rejects.toThrow();
    await expect(
      db
        .update(compensationNote)
        .set({ discountAmount: 50_000 })
        .where(eq(compensationNote.id, noteId)),
    ).rejects.toThrow();
  });

  it("refuses two compensation notes for one return note", async () => {
    const { returnId } = await pendingCompensation();
    await expect(
      db.transaction((tx) => insertCompensation(tx, returnId)),
    ).rejects.toThrow();
  });

  it("keeps photos of a posted note, lets draft photos go", async () => {
    const draftPhoto = await insertPhoto();
    await db.delete(returnPhoto).where(eq(returnPhoto.id, draftPhoto));
    const photo = await insertPhoto();
    const noteId = await db.transaction(async (tx) => {
      const id = await insertNote(tx);
      await tx.insert(returnNoteLine).values(line(id));
      await tx
        .update(returnPhoto)
        .set({ returnNoteId: id, position: 1 })
        .where(eq(returnPhoto.id, photo));
      return id;
    });
    await expect(
      db.delete(returnPhoto).where(eq(returnPhoto.id, photo)),
    ).rejects.toThrow();
    await expect(
      db
        .update(returnPhoto)
        .set({ returnNoteId: null })
        .where(eq(returnPhoto.returnNoteId, noteId)),
    ).rejects.toThrow();
  });

  it("refuses attaching a photo to a note of another transaction", async () => {
    const noteId = await postedNote();
    const photo = await insertPhoto();
    await expect(
      db
        .update(returnPhoto)
        .set({ returnNoteId: noteId })
        .where(eq(returnPhoto.id, photo)),
    ).rejects.toThrow();
  });

  it("refuses a lost line with a positive quantity", async () => {
    await expect(
      db.insert(inventoryLedger).values({
        postingId: crypto.randomUUID(),
        businessDate: "2026-11-05",
        itemId,
        condition: "GOOD",
        locationId: siteLocationId,
        movement: "LOSS_OUT",
        quantity: "2",
        unitCost: 400_000,
        amount: 800_000,
        avgCostAfter: 400_000,
        poolQuantityAfter: "0",
        documentType: "RETURN_NOTE",
        documentCode: "PTH-2026-001",
        description: "test",
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });
});
