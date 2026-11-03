// State of the "Tạo đợt xuất" form (deliveries tasks 5.2): kits and lines
// as typed, the parts preview, the over-delivery hint and the request body.
import { byWeight, explodeKits } from "@/domain/contract-lines";
import type { ContractType } from "@/domain/contract";
import { lineKey } from "@/domain/delivery-note";
import { DomainValueError } from "@/domain/errors";
import { parseQuantity, type QuantityUnit } from "@/domain/quantity";
import type {
  ContractDeliveries,
  PlanBatchOption,
} from "@/lib/deliveries/queries";
import type { DeliveryBody } from "@/lib/deliveries/service";

export interface KitRow {
  key: string;
  kitId: string;
  quantity: string;
}

export interface LineRow {
  key: string;
  /** lineKey of the contract line (rental: the item id). */
  lineKey: string;
  quantity: string;
}

export type FormItem = ContractDeliveries["items"][number];
export type FormKit = ContractDeliveries["kits"][number];

let counter = 0;
export const rowKey = () => {
  counter += 1;
  return `row-${counter}`;
};

export const itemKey = (item: FormItem) =>
  lineKey(
    item.id,
    item.condition,
    item.condition === null ? null : item.pricingUnit,
  );

export const itemUnit = (item: FormItem): QuantityUnit =>
  byWeight(item.pricingUnit ?? "") ? "KG" : item.unit;

function milliOf(text: string, unit: QuantityUnit): number | null {
  try {
    const value = parseQuantity(text, unit);
    return value.milli > 0 ? value.milli : null;
  } catch (error: unknown) {
    if (error instanceof DomainValueError) return null;
    throw error;
  }
}

export interface PreviewLine {
  key: string;
  item: FormItem;
  milli: number;
  /** Above what is not on a note yet. */
  overMilli: number;
}

/** Parts after kits are split, with what goes over "chưa lên phiếu". */
export function preview(
  items: readonly FormItem[],
  kits: readonly FormKit[],
  kitRows: readonly KitRow[],
  lineRows: readonly LineRow[],
  unplanned: Readonly<Record<string, number>>,
): PreviewLine[] {
  const byKey = new Map(items.map((item) => [itemKey(item), item]));
  const kitById = new Map(kits.map((kit) => [kit.id, kit]));
  const sale = items.some((item) => item.condition !== null);
  const amounts = new Map<string, number>();
  if (sale) {
    for (const row of lineRows) {
      const item = byKey.get(row.lineKey);
      const milli = item ? milliOf(row.quantity, itemUnit(item)) : null;
      if (item && milli !== null) {
        amounts.set(row.lineKey, (amounts.get(row.lineKey) ?? 0) + milli);
      }
    }
  } else {
    const picks = kitRows.flatMap((row) => {
      const kit = kitById.get(row.kitId);
      const quantity = Number(row.quantity);
      return kit && Number.isInteger(quantity) && quantity > 0
        ? [{ kitId: kit.id, quantity, components: kit.components }]
        : [];
    });
    const own = lineRows.flatMap((row) => {
      const item = byKey.get(row.lineKey);
      const milli = item ? milliOf(row.quantity, item.unit) : null;
      return item && milli !== null
        ? [{ itemId: item.id, ownMilli: milli }]
        : [];
    });
    try {
      for (const line of explodeKits(picks, own)) {
        amounts.set(line.itemId, line.quantityMilli);
      }
    } catch (error: unknown) {
      if (!(error instanceof DomainValueError)) throw error;
    }
  }
  return items.flatMap((item) => {
    const key = itemKey(item);
    const milli = amounts.get(key);
    if (milli === undefined) return [];
    return [
      {
        key,
        item,
        milli,
        overMilli: Math.max(milli - (unplanned[key] ?? 0), 0),
      },
    ];
  });
}

export interface FormState {
  type: ContractType;
  kits: KitRow[];
  lines: LineRow[];
  sourceLocationId: string;
  plannedDate: string;
  companyTruck: boolean;
  freight: string;
  vehiclePlate: string;
  note: string;
  overConfirmed: boolean;
}

/** The POST / PUT body of the form. */
export function bodyOf(
  state: FormState,
  items: readonly FormItem[],
): DeliveryBody & { freightError?: string } {
  const byKey = new Map(items.map((item) => [itemKey(item), item]));
  const freightText = state.freight.replace(/[.\s₫]/g, "");
  const freight = freightText === "" ? null : Number(freightText);
  return {
    sourceLocationId: state.sourceLocationId || null,
    plannedDate: state.plannedDate || null,
    kits:
      state.type === "RENTAL"
        ? state.kits.map((row) => ({
            kitId: row.kitId,
            quantity: Number(row.quantity),
          }))
        : [],
    lines: state.lines.map((row) => {
      const item = byKey.get(row.lineKey);
      return {
        itemId: item?.id,
        condition: item?.condition ?? null,
        pricingUnit:
          item?.condition === null ? null : (item?.pricingUnit ?? null),
        quantity: row.quantity,
      };
    }),
    companyTruck: state.companyTruck,
    freightAmount: state.companyTruck ? freight : null,
    vehiclePlate: state.vehiclePlate || null,
    note: state.note || null,
    overContractConfirmed: state.overConfirmed,
  };
}

/** Rows filled from one batch of the contract plan ("Theo kế hoạch đợt N"). */
export function fromPlan(batch: PlanBatchOption): {
  kits: KitRow[];
  lines: LineRow[];
} {
  return {
    kits: batch.kits.map((kit) => ({
      key: rowKey(),
      kitId: kit.kitId,
      quantity: String(kit.quantity),
    })),
    lines: batch.lines.map((line) => ({
      key: rowKey(),
      lineKey: line.itemId,
      quantity: line.quantity.replace(/\.?0+$/, "").replace(".", ","),
    })),
  };
}
