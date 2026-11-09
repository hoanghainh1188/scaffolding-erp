// Production BOMs (spec production-boms, design D9, D10). Writes lock the BOM
// FOR UPDATE and hold its items FOR SHARE; only real changes reach the log.
import { asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  item,
  itemGroup,
  productionBom,
  productionBomMaterial,
} from "@/db/schema";
import type { FieldChange } from "@/domain/activity-changes";
import { countText, joinParts } from "@/domain/activity-summary";
import {
  BOM_MESSAGES,
  BOM_NOTE_MAX,
  ProductionFieldError,
  checkBom,
  type BomItem,
  type BomMaterialInput,
  type ItemCategory,
} from "@/domain/production-bom";
import { DomainValueError } from "@/domain/errors";
import { formatMoney, toMoney } from "@/domain/money";
import {
  formatQuantity,
  QUANTITY_UNIT_LABELS,
  quantityFromDb,
  quantityToDb,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
  isUniqueViolation,
  notFound,
  ok,
  optionalText,
  ServiceFailure,
  type Actor,
  type ServiceResult,
} from "@/lib/catalog/common";
import type { Tx } from "@/lib/inventory/post";
import { unitFromDb } from "@/lib/inventory/unit";

import { UUID, runProduction } from "./common";

export interface BomBody {
  laborRate?: number;
  note?: string | null;
  materials?: { itemId?: string; quantity?: string }[];
  /** The BOM's updatedAt the form was opened with (edits only). */
  updatedAt?: string;
}

export interface SavedBom {
  itemCode: string;
  updatedAt: Date;
}

interface LoadedItem extends BomItem {
  readonly unit: QuantityUnit;
}

/** Items by id, FOR SHARE in id order (the lock order of every posting). */
export async function loadBomItems(
  tx: Tx,
  ids: readonly string[],
): Promise<Map<string, LoadedItem>> {
  const unique = [...new Set(ids)];
  if (!unique.every((id) => UUID.test(id))) {
    throw new DomainValueError("Không tìm thấy vật tư");
  }
  if (unique.length === 0) return new Map();
  const rows = await tx
    .select({
      id: item.id,
      code: item.code,
      unit: item.unit,
      status: item.status,
      category: itemGroup.category,
    })
    .from(item)
    .innerJoin(itemGroup, eq(itemGroup.id, item.groupId))
    .where(inArray(item.id, unique))
    .orderBy(asc(item.id))
    .for("share", { of: item });
  return new Map(
    rows.map((row) => [
      row.id,
      {
        itemId: row.id,
        itemCode: row.code,
        unit: unitFromDb(row.unit),
        category: row.category as ItemCategory,
        active: row.status === "ACTIVE",
      },
    ]),
  );
}

interface CheckedBom {
  laborRate: number;
  note: string | null;
  materials: BomMaterialInput[];
}

function readPerUnit(value: string | undefined, index: number): number {
  try {
    return quantityFromDb((value ?? "").trim(), "KG").milli;
  } catch {
    throw new ProductionFieldError(
      BOM_MESSAGES.quantity,
      `materials.${index}.quantity`,
    );
  }
}

async function checkBody(
  tx: Tx,
  finishedId: string,
  body: BomBody,
): Promise<CheckedBom> {
  const raw = body.materials ?? [];
  const items = await loadBomItems(tx, [
    finishedId,
    ...raw.map((material) => material.itemId ?? ""),
  ]);
  const finished = items.get(finishedId);
  if (!finished) throw new DomainValueError("Không tìm thấy vật tư");
  const materials = raw.map((material, index): BomMaterialInput => {
    const found = items.get(material.itemId ?? "");
    if (!found) throw new DomainValueError("Không tìm thấy vật tư");
    return { ...found, perUnitMilli: readPerUnit(material.quantity, index) };
  });
  const laborRate = body.laborRate ?? -1;
  checkBom({ finished, laborRate, materials });
  const note = optionalText(body.note);
  if (note && note.length > BOM_NOTE_MAX) {
    throw new ProductionFieldError(BOM_MESSAGES.noteTooLong, "note");
  }
  return { laborRate, note, materials };
}

async function writeMaterials(
  tx: Tx,
  bomId: string,
  materials: readonly BomMaterialInput[],
): Promise<void> {
  await tx
    .delete(productionBomMaterial)
    .where(eq(productionBomMaterial.bomId, bomId));
  await tx.insert(productionBomMaterial).values(
    materials.map((material, index) => ({
      bomId,
      itemId: material.itemId,
      // A BOM may hold 0,5 cây: per-piece figures are not stock quantities.
      quantityPerUnit: quantityToDb(toQuantity(material.perUnitMilli, "KG")),
      position: index + 1,
    })),
  );
}

async function finishedByCode(tx: Tx, code: string) {
  const [row] = await tx
    .select({ id: item.id, code: item.code })
    .from(item)
    .where(eq(item.code, code));
  if (!row) throw new ServiceFailure(notFound());
  return row;
}

const money = (value: number) => formatMoney(toMoney(value));

const perUnitText = (milli: number, unit: QuantityUnit) =>
  `${formatQuantity({ unit: "KG", milli })} ${QUANTITY_UNIT_LABELS[unit]} / cái`;

export function createBom(
  db: Database,
  actor: Actor,
  itemCode: string,
  body: BomBody,
): Promise<ServiceResult<SavedBom>> {
  return runProduction(async () => {
    try {
      const saved = await db.transaction(async (tx) => {
        const finished = await finishedByCode(tx, itemCode);
        const checked = await checkBody(tx, finished.id, body);
        const [existing] = await tx
          .select({ id: productionBom.id })
          .from(productionBom)
          .where(eq(productionBom.itemId, finished.id));
        if (existing) {
          throw new ServiceFailure(conflict(BOM_MESSAGES.exists(itemCode)));
        }
        const [row] = await tx
          .insert(productionBom)
          .values({
            itemId: finished.id,
            laborRate: checked.laborRate,
            note: checked.note,
            createdBy: actor.id,
            updatedBy: actor.id,
          })
          .returning({
            id: productionBom.id,
            updatedAt: productionBom.updatedAt,
          });
        const id = row?.id ?? "";
        await writeMaterials(tx, id, checked.materials);
        await logActivity(tx, actor, {
          action: "CREATE",
          document: { type: "PRODUCTION_BOM", id, code: itemCode },
          summary: joinParts(
            countText(checked.materials.length, "nguyên liệu"),
            `công ${money(checked.laborRate)}`,
          ),
        });
        return { itemCode, updatedAt: row?.updatedAt ?? new Date() };
      });
      return ok(saved);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        return conflict(BOM_MESSAGES.exists(itemCode));
      }
      throw error;
    }
  });
}

async function lockBom(tx: Tx, itemCode: string) {
  const [row] = await tx
    .select({ bom: productionBom, itemCode: item.code })
    .from(productionBom)
    .innerJoin(item, eq(item.id, productionBom.itemId))
    .where(eq(item.code, itemCode))
    .for("update", { of: productionBom });
  if (!row) {
    throw new ServiceFailure({
      ok: false,
      status: 404,
      error: BOM_MESSAGES.notFound,
    });
  }
  return row.bom;
}

interface StoredMaterial {
  itemId: string;
  itemCode: string;
  unit: QuantityUnit;
  perUnitMilli: number;
}

async function storedMaterials(
  tx: Tx,
  bomId: string,
): Promise<StoredMaterial[]> {
  const rows = await tx
    .select({
      itemId: productionBomMaterial.itemId,
      itemCode: item.code,
      unit: item.unit,
      quantity: productionBomMaterial.quantityPerUnit,
    })
    .from(productionBomMaterial)
    .innerJoin(item, eq(item.id, productionBomMaterial.itemId))
    .where(eq(productionBomMaterial.bomId, bomId))
    .orderBy(asc(productionBomMaterial.position));
  return rows.map((row) => ({
    itemId: row.itemId,
    itemCode: row.itemCode,
    unit: unitFromDb(row.unit),
    perUnitMilli: quantityFromDb(row.quantity, "KG").milli,
  }));
}

function materialChanges(
  before: readonly StoredMaterial[],
  after: readonly BomMaterialInput[],
): FieldChange[] {
  const old = new Map(before.map((material) => [material.itemId, material]));
  const changes: FieldChange[] = [];
  for (const material of after) {
    const previous = old.get(material.itemId);
    if (previous?.perUnitMilli === material.perUnitMilli) continue;
    changes.push({
      field: `material.${material.itemCode}`,
      label: material.itemCode,
      before: previous
        ? formatQuantity({ unit: "KG", milli: previous.perUnitMilli })
        : null,
      after: perUnitText(material.perUnitMilli, material.unit),
    });
  }
  const kept = new Set(after.map((material) => material.itemId));
  for (const material of before) {
    if (kept.has(material.itemId)) continue;
    changes.push({
      field: `material.${material.itemCode}`,
      label: material.itemCode,
      before: perUnitText(material.perUnitMilli, material.unit),
      after: null,
    });
  }
  return changes;
}

function changeText(change: FieldChange): string {
  if (change.before === null) return `thêm ${change.label} ${change.after}`;
  if (change.after === null) return `bỏ ${change.label}`;
  return `${change.label}: ${change.before} → ${change.after}`;
}

export function updateBom(
  db: Database,
  actor: Actor,
  itemCode: string,
  body: BomBody,
): Promise<ServiceResult<SavedBom>> {
  return runProduction(async () => {
    const saved = await db.transaction(async (tx) => {
      const current = await lockBom(tx, itemCode);
      if (
        !body.updatedAt ||
        new Date(body.updatedAt).getTime() !== current.updatedAt.getTime()
      ) {
        throw new ServiceFailure(conflict(BOM_MESSAGES.stale));
      }
      const checked = await checkBody(tx, current.itemId, body);
      const before = await storedMaterials(tx, current.id);
      const changes = materialChanges(before, checked.materials);
      if (current.laborRate !== checked.laborRate) {
        changes.push({
          field: "laborRate",
          label: "công",
          before: money(current.laborRate),
          after: money(checked.laborRate),
        });
      }
      if (current.note !== checked.note) {
        changes.push({
          field: "note",
          label: "ghi chú",
          before: current.note,
          after: checked.note,
        });
      }
      const order = (rows: readonly { itemId: string }[]) =>
        rows.map((row) => row.itemId).join();
      if (changes.length === 0 && order(before) === order(checked.materials)) {
        return { itemCode, updatedAt: current.updatedAt };
      }
      const updatedAt = new Date();
      await tx
        .update(productionBom)
        .set({
          laborRate: checked.laborRate,
          note: checked.note,
          updatedBy: actor.id,
          updatedAt,
        })
        .where(eq(productionBom.id, current.id));
      await writeMaterials(tx, current.id, checked.materials);
      if (changes.length > 0) {
        await logActivity(tx, actor, {
          action: "UPDATE",
          document: {
            type: "PRODUCTION_BOM",
            id: current.id,
            code: itemCode,
          },
          summary: changes.map(changeText).join("; "),
          changes,
        });
      }
      return { itemCode, updatedAt };
    });
    return ok(saved);
  });
}

/** Orders already assigned keep their copy (spec "Sửa định mức…"). */
export function deleteBom(
  db: Database,
  actor: Actor,
  itemCode: string,
): Promise<ServiceResult<null>> {
  return runProduction(async () => {
    await db.transaction(async (tx) => {
      const current = await lockBom(tx, itemCode);
      const materials = await storedMaterials(tx, current.id);
      await tx.delete(productionBom).where(eq(productionBom.id, current.id));
      await logActivity(tx, actor, {
        action: "DELETE",
        document: { type: "PRODUCTION_BOM", id: current.id, code: itemCode },
        summary: joinParts(
          countText(materials.length, "nguyên liệu"),
          `công ${money(current.laborRate)}`,
        ),
      });
    });
    return ok(null);
  });
}
