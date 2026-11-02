import { eq, inArray, sql } from "drizzle-orm";

import { item, itemAlias, kit } from "@/db/schema";
import { itemCodeKey } from "@/domain/item-code";
import type { Executor } from "@/lib/auth/credentials";

import { COMMON_MESSAGES, ServiceFailure, conflict } from "./common";

export const CODE_MESSAGES = {
  similar: (code: string) => `Mã gần giống mã ${code} đã có`,
  isOldCode: (code: string, owner: string) =>
    `Mã ${code} đang là mã cũ của ${owner}`,
  isOtherItem: (code: string) => `Mã ${code} đã là mã của vật tư khác`,
  sameAsMain: (code: string) => `Mã cũ ${code} trùng mã chính của vật tư`,
  duplicateOld: (code: string) => `Mã cũ ${code} bị nhập hai lần`,
} as const;

/**
 * Item codes, kit codes and old codes share one space keyed by code_key
 * (catalog-extensions design D1). Three tables cannot enforce that with one
 * index, so every writer takes this lock first and checks all three inside
 * the same transaction. The unique indexes stay as the last guard.
 */
async function lockCodeSpace(tx: Executor): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('catalog-code'))`);
}

interface Holder {
  kind: "ITEM" | "KIT" | "ALIAS";
  code: string;
  /** The item an old code belongs to, or the item / kit itself. */
  ownerId: string;
  ownerCode: string;
}

async function holdersOf(
  tx: Executor,
  keys: readonly string[],
): Promise<Map<string, Holder>> {
  const found = new Map<string, Holder>();
  if (keys.length === 0) return found;
  const list = [...keys];
  const items = await tx
    .select({ id: item.id, code: item.code, key: item.codeKey })
    .from(item)
    .where(inArray(item.codeKey, list));
  for (const row of items) {
    found.set(row.key, {
      kind: "ITEM",
      code: row.code,
      ownerId: row.id,
      ownerCode: row.code,
    });
  }
  const kits = await tx
    .select({ id: kit.id, code: kit.code, key: kit.codeKey })
    .from(kit)
    .where(inArray(kit.codeKey, list));
  for (const row of kits) {
    found.set(row.key, {
      kind: "KIT",
      code: row.code,
      ownerId: row.id,
      ownerCode: row.code,
    });
  }
  const aliases = await tx
    .select({
      code: itemAlias.code,
      key: itemAlias.codeKey,
      itemId: itemAlias.itemId,
      itemCode: item.code,
    })
    .from(itemAlias)
    .innerJoin(item, eq(item.id, itemAlias.itemId))
    .where(inArray(itemAlias.codeKey, list));
  for (const row of aliases) {
    found.set(row.key, {
      kind: "ALIAS",
      code: row.code,
      ownerId: row.itemId,
      ownerCode: row.itemCode,
    });
  }
  return found;
}

/** Locks the code space and refuses a new item or kit code already held. */
export async function claimItemOrKitCode(
  tx: Executor,
  code: string,
): Promise<void> {
  await lockCodeSpace(tx);
  const holder = (await holdersOf(tx, [itemCodeKey(code)])).values().next()
    .value as Holder | undefined;
  if (!holder) return;
  if (holder.kind === "ALIAS") {
    throw new ServiceFailure(
      conflict(CODE_MESSAGES.isOldCode(holder.code, holder.ownerCode)),
    );
  }
  if (holder.code === code) {
    throw new ServiceFailure(conflict(COMMON_MESSAGES.codeTaken));
  }
  throw new ServiceFailure(conflict(CODE_MESSAGES.similar(holder.code)));
}

/**
 * Locks the code space and refuses old codes of `itemId` held by anything
 * else: another item's code or old code, a kit, or the item's own code.
 * Old codes the item already has pass.
 */
export async function claimOldCodes(
  tx: Executor,
  itemId: string,
  itemCode: string,
  codes: readonly string[],
): Promise<void> {
  await lockCodeSpace(tx);
  const keys = codes.map(itemCodeKey);
  const seen = new Set<string>();
  for (const [index, key] of keys.entries()) {
    const code = codes[index] ?? "";
    if (key === itemCodeKey(itemCode)) {
      throw new ServiceFailure(conflict(CODE_MESSAGES.sameAsMain(code)));
    }
    if (seen.has(key)) {
      throw new ServiceFailure(conflict(CODE_MESSAGES.duplicateOld(code)));
    }
    seen.add(key);
  }
  const holders = await holdersOf(tx, keys);
  for (const [index, key] of keys.entries()) {
    const holder = holders.get(key);
    const code = codes[index] ?? "";
    if (!holder) continue;
    if (holder.kind === "ALIAS" && holder.ownerId === itemId) continue;
    if (holder.kind === "ALIAS") {
      throw new ServiceFailure(
        conflict(CODE_MESSAGES.isOldCode(holder.code, holder.ownerCode)),
      );
    }
    if (holder.kind === "ITEM") {
      throw new ServiceFailure(conflict(CODE_MESSAGES.isOtherItem(code)));
    }
    throw new ServiceFailure(conflict(COMMON_MESSAGES.codeTaken));
  }
}
