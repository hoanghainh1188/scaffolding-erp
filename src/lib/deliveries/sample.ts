// Sample delivery notes for dev (deliveries tasks 7.1): on the approved
// rental at Chung cư An Phú – Block B, Đợt 1 posted (the 40 PK-KU of the
// contract, so the GG-K17 worked example of D11 is left alone) and Đợt 2
// waiting to be picked (50 kits). Created through the services; runs only
// while there is no delivery note yet, so running it again adds nothing.
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  deliveryNote,
  deliveryNoteLine,
  item,
  kit,
  site,
} from "@/db/schema";
import type { Actor } from "@/lib/catalog/common";
import type { ContractActor } from "@/lib/contracts/common";

import { postDelivery } from "./post";
import { changeDeliveryStatus, createDelivery } from "./service";

const SITE = "Chung cư An Phú – Block B";

function ok<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function seedDeliveries(
  db: Database,
  people: { sales: Actor; warehouse: Actor },
): Promise<number> {
  const [any] = await db
    .select({ id: deliveryNote.id })
    .from(deliveryNote)
    .limit(1);
  if (any) return 0;
  const [deal] = await db
    .select({ id: contract.id })
    .from(contract)
    .innerJoin(site, eq(site.id, contract.siteId))
    .where(and(eq(site.name, SITE), eq(contract.status, "APPROVED")));
  if (!deal) return 0;
  const [ku] = await db
    .select({ id: item.id })
    .from(item)
    .where(eq(item.code, "PK-KU"));
  const [bo] = await db
    .select({ id: kit.id })
    .from(kit)
    .where(eq(kit.code, "BO-17"));
  if (!ku || !bo) return 0;
  const sales: ContractActor = { ...people.sales, contractScope: "ALL" };
  const warehouse: ContractActor = {
    ...people.warehouse,
    contractScope: "ALL",
  };

  const first = ok(
    await createDelivery(db, sales, {
      contractId: deal.id,
      lines: [{ itemId: ku.id, quantity: "40" }],
      vehiclePlate: "51X-000.01",
      note: "Đợt mẫu: kích tăng U",
    }),
  );
  const started = ok(
    await changeDeliveryStatus(db, warehouse, first.id, "START"),
  );
  const [line] = await db
    .select({ id: deliveryNoteLine.id })
    .from(deliveryNoteLine)
    .where(eq(deliveryNoteLine.noteId, first.id));
  ok(
    await postDelivery(db, warehouse, first.id, {
      clientDraftId: randomUUID(),
      startedVersion: started.updatedAt,
      vehiclePlate: "51X-000.01",
      picks: [{ lineId: line?.id, condition: "NEW", quantity: "40" }],
    }),
  );
  ok(
    await createDelivery(db, sales, {
      contractId: deal.id,
      kits: [{ kitId: bo.id, quantity: 50 }],
      note: "Đợt mẫu: 50 bộ giàn giáo",
    }),
  );
  return 2;
}
