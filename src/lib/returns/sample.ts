// A sample return note for dev (returns-and-compensation tasks 7.1): the
// rental at Chung cư An Phú – Block B sends back part of the 40 PK-KU of
// its first batch (30 Tốt, 5 Chờ sửa, 3 Mất; 2 stay on site) with two
// sample photos, so D6 has a return row and D8 a note waiting for the
// director. Created through the services; runs only while there is no
// return note yet.
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import sharp from "sharp";

import type { Database } from "@/db/client";
import { contract, item, location, returnNote, site } from "@/db/schema";
import type { Actor } from "@/lib/catalog/common";
import type { ContractActor } from "@/lib/contracts/common";

import { uploadReturnPhoto } from "./photos";
import { postReturn } from "./post";

const SITE = "Chung cư An Phú – Block B";

/** A plain coloured picture standing in for a camera photo. */
const samplePicture = (background: { r: number; g: number; b: number }) =>
  sharp({ create: { width: 800, height: 600, channels: 3, background } })
    .jpeg()
    .toBuffer();

export async function seedReturns(
  db: Database,
  people: { warehouse: Actor },
): Promise<number> {
  const [any] = await db
    .select({ id: returnNote.id })
    .from(returnNote)
    .limit(1);
  if (any) return 0;
  const [deal] = await db
    .select({ id: contract.id })
    .from(contract)
    .innerJoin(site, eq(site.id, contract.siteId))
    .where(and(eq(site.name, SITE), eq(contract.status, "ACTIVE")));
  const [ku] = await db
    .select({ id: item.id })
    .from(item)
    .where(eq(item.code, "PK-KU"));
  const [yard] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, "BAI-01"));
  if (!deal || !ku || !yard) return 0;
  const warehouse: ContractActor = {
    ...people.warehouse,
    contractScope: "ALL",
  };
  const draftId = randomUUID();
  const photoIds: string[] = [];
  for (const [background, caption] of [
    [{ r: 138, g: 109, b: 59 }, "Kích U cong ren"],
    [{ r: 95, g: 107, b: 122 }, "Kích U gãy đế"],
  ] as const) {
    const sent = await uploadReturnPhoto(db, warehouse, {
      draftId,
      clientPhotoId: randomUUID(),
      caption,
      bytes: await samplePicture(background),
    });
    if (sent.ok) photoIds.push(sent.data.id);
  }
  const posted = await postReturn(db, warehouse, {
    clientDraftId: draftId,
    contractId: deal.id,
    yardLocationId: yard.id,
    vehiclePlate: "29C-456.78",
    note: "Phiếu mẫu: trả một phần kích U",
    lines: [{ itemId: ku.id, good: "30", repair: "5", lost: "3" }],
    photoIds,
  });
  if (!posted.ok) throw new Error(posted.error);
  return 1;
}
