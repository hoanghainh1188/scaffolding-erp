// Sample site operations for dev (site-operations tasks 7.1): a second
// rental of Minh Phát at Trường THCS Dương Nội, approved, to receive goods;
// from the running rental at Chung cư An Phú – Block B a transfer sent to
// the phone like M9, a buy-back waiting for the director like D6c and an
// exchange waiting for its return like D6d. Created through the services;
// runs only while there is no transfer yet.
import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  customer,
  item,
  kit,
  location,
  site,
  siteTransfer,
} from "@/db/schema";
import { createBuyBack } from "@/lib/buy-backs/service";
import type { Actor } from "@/lib/catalog/common";
import { approveContract, submitContract } from "@/lib/contracts/approval";
import type { ContractActor } from "@/lib/contracts/common";
import { createContract } from "@/lib/contracts/service";
import { onSiteByItem } from "@/lib/deliveries/records";
import { createExchange } from "@/lib/exchanges/service";

import { changeSiteTransferStatus, createSiteTransfer } from "./service";

const FROM_SITE = "Chung cư An Phú – Block B";
const TO_SITE = "Trường THCS Dương Nội";
const MINH_PHAT = "Cty TNHH Xây dựng Minh Phát";

function ok<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function idOf<T extends { id: string }>(rows: Promise<T[]>) {
  const [row] = await rows;
  return row?.id ?? null;
}

export async function seedSiteOperations(
  db: Database,
  people: { director: Actor; sales: Actor },
): Promise<number> {
  const [any] = await db
    .select({ id: siteTransfer.id })
    .from(siteTransfer)
    .limit(1);
  if (any) return 0;
  const from = await idOf(
    db
      .select({ id: contract.id })
      .from(contract)
      .innerJoin(site, eq(site.id, contract.siteId))
      .where(and(eq(site.name, FROM_SITE), eq(contract.status, "ACTIVE"))),
  );
  const ku = await idOf(
    db.select({ id: item.id }).from(item).where(eq(item.code, "PK-KU")),
  );
  const cross = await idOf(
    db.select({ id: item.id }).from(item).where(eq(item.code, "GG-CH")),
  );
  const bo = await idOf(
    db.select({ id: kit.id }).from(kit).where(eq(kit.code, "BO-17")),
  );
  const buyer = await idOf(
    db
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.name, MINH_PHAT)),
  );
  const target = await idOf(
    db.select({ id: site.id }).from(site).where(eq(site.name, TO_SITE)),
  );
  const yard = await idOf(
    db
      .select({ id: location.id })
      .from(location)
      .where(eq(location.code, "BAI-01")),
  );
  if (!from || !ku || !cross || !bo || !buyer || !target || !yard) return 0;
  // What is still at An Phú for this contract: a fresh database keeps the
  // 2 kích U of the sample return; a dev database may have moved them.
  const onSite = await onSiteByItem(db, from);
  const kept = onSite.get(ku) ?? 0;
  const [other] = [...onSite].filter(([, milli]) => milli > 0);
  const goods = kept > 0 ? ku : other?.[0];
  if (!goods) return 0;
  const count = String(
    Math.min(2_000, kept > 0 ? kept : (other?.[1] ?? 0)) / 1000,
  );
  const director: ContractActor = { ...people.director, contractScope: "ALL" };
  const sales: ContractActor = { ...people.sales, contractScope: "ALL" };

  // The receiving rental: approved, nothing delivered yet.
  const to = ok(
    await createContract(db, sales, {
      type: "RENTAL",
      customerId: buyer,
      siteId: target,
      customerToken: "MINHPHAT",
      signedDate: "2026-11-02",
      startDate: "2026-11-05",
      endDate: "2027-02-28",
      kits: [{ kitId: bo, quantity: 300 }],
      lines: [{ itemId: ku, quantity: "100" }],
    }),
  );
  ok(await submitContract(db, sales, to.id));
  ok(await approveContract(db, director, to.id, null));

  // M9: a transfer of the 2 kích U still at An Phú, sent to the phone.
  const transfer = ok(
    await createSiteTransfer(db, sales, {
      fromContractId: from,
      toContractId: to.id,
      lines: [{ itemId: goods, quantity: count }],
      vehiclePlate: "29C-456.78",
      note: "Phiếu mẫu: chuyển kích U sang Dương Nội",
    }),
  );
  ok(
    await changeSiteTransferStatus(db, sales, transfer.id, "SEND", {
      updatedAt: transfer.updatedAt,
    }),
  );

  // D6c: the customer buys the same 2 kích U, waiting for the director.
  ok(
    await createBuyBack(db, sales, {
      contractId: from,
      reason: "Kích U đã đổ bê tông, không tháo ra được",
      lines: [{ itemId: goods, quantity: count }],
    }),
  );

  // D6d: 10 chéo out from BAI-01, the 2 kích U expected back.
  ok(
    await createExchange(db, sales, {
      contractId: from,
      sourceLocationId: yard,
      lines: [{ itemId: cross, quantity: "10" }],
      expected: [{ itemId: goods, quantity: count }],
      overContractConfirmed: true,
      note: "Đợt mẫu: đổi hàng",
    }),
  );
  return 4;
}
