// The D3 preview (spec purchase-orders "Xem trước chi phí trên D3"): what the
// form shows while the user types. Pure: reads the draft text, never saves.
import { DomainValueError } from "@/domain/errors";
import {
  allocate,
  landedUnitCost,
  lineWeightKgMilli,
  type AllocationMethod,
} from "@/domain/landed-cost";
import { parseMoney, toMoney, type Money } from "@/domain/money";
import { estimatedUnitsMilli, orderLineAmount } from "@/domain/purchase-order";
import {
  formatQuantity,
  hasStandardWeight,
  parseQuantity,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";

export interface ItemChoice {
  id: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  standardWeightKg: string | null;
}

export interface DraftLine {
  key: number;
  itemId: string;
  unit: QuantityUnit;
  quantity: string;
  unitPrice: string;
}

export interface DraftCost {
  key: number;
  label: string;
  amount: string;
}

export interface LinePreview {
  quantityMilli: number | null;
  price: Money | null;
  amount: Money | null;
  allocated: Money | null;
  unitCost: Money | null;
  /** "148 cái", "61,797 m": units in a kg line of a weighted item. */
  estimate: string | null;
}

export interface OrderPreview {
  lines: LinePreview[];
  goods: Money;
  costs: Money;
  total: Money;
  /** Why the costs cannot be split (e.g. free goods by value). */
  allocationError: string | null;
}

function tryParse<T>(read: () => T): T | null {
  try {
    return read();
  } catch (error) {
    if (error instanceof DomainValueError) return null;
    throw error;
  }
}

export function readQuantity(text: string, unit: QuantityUnit): number | null {
  if (text.trim() === "") return null;
  const parsed = tryParse(() => parseQuantity(text, unit));
  return parsed && parsed.milli > 0 ? parsed.milli : null;
}

export function readMoney(text: string): Money | null {
  if (text.trim() === "") return null;
  const parsed = tryParse(() => parseMoney(text));
  return parsed !== null && parsed >= 0 ? parsed : null;
}

/**
 * The unit shown next to a quantity or price ("(kg)", "/m"): none for cái,
 * which the item name already implies, the label for every other unit.
 */
export function unitHint(unit: QuantityUnit): string | null {
  const label = QUANTITY_UNIT_LABELS[unit];
  return label === QUANTITY_UNIT_LABELS.PIECE ? null : label;
}

function estimateOf(
  lineUnit: QuantityUnit,
  choice: ItemChoice | null,
  quantityMilli: number | null,
): string | null {
  if (!choice || quantityMilli === null) return null;
  if (hasStandardWeight(lineUnit) || !hasStandardWeight(choice.unit)) {
    return null;
  }
  const milli = estimatedUnitsMilli(
    quantityMilli,
    choice.standardWeightKg,
    choice.unit,
  );
  if (milli === null) return null;
  return `${formatQuantity(toQuantity(milli, choice.unit))} ${QUANTITY_UNIT_LABELS[choice.unit]}`;
}

export function previewOrder(
  lines: readonly DraftLine[],
  costs: readonly DraftCost[],
  method: AllocationMethod,
  items: ReadonlyMap<string, ItemChoice>,
): OrderPreview {
  const read = lines.map((line) => {
    const choice = items.get(line.itemId) ?? null;
    const quantityMilli = readQuantity(line.quantity, line.unit);
    const price = readMoney(line.unitPrice);
    const amount =
      quantityMilli !== null && price !== null
        ? orderLineAmount(quantityMilli, price)
        : null;
    return { line, choice, quantityMilli, price, amount };
  });
  const goods = toMoney(read.reduce((sum, row) => sum + (row.amount ?? 0), 0));
  const costTotal = toMoney(
    costs.reduce((sum, cost) => sum + (readMoney(cost.amount) ?? 0), 0),
  );
  const ready = read.filter(
    (row) => row.amount !== null && row.quantityMilli !== null && row.choice,
  );
  let allocated: Money[] = [];
  let allocationError: string | null = null;
  if (ready.length > 0) {
    try {
      allocated = allocate(
        costTotal,
        ready.map((row) => ({
          amount: row.amount as Money,
          weightKgMilli: lineWeightKgMilli(
            row.line.unit,
            row.quantityMilli as number,
            row.choice?.standardWeightKg ?? null,
          ),
          quantityMilli: row.quantityMilli as number,
        })),
        method,
      );
    } catch (error) {
      if (!(error instanceof DomainValueError)) throw error;
      allocationError = error.message;
    }
  }
  const share = new Map(
    ready.map((row, index) => [row.line.key, allocated[index] ?? null]),
  );
  return {
    lines: read.map((row) => {
      const part = share.get(row.line.key) ?? null;
      return {
        quantityMilli: row.quantityMilli,
        price: row.price,
        amount: row.amount,
        allocated: part,
        unitCost:
          part !== null && row.amount !== null && row.quantityMilli !== null
            ? landedUnitCost(row.amount, part, row.quantityMilli)
            : null,
        estimate: estimateOf(row.line.unit, row.choice, row.quantityMilli),
      };
    }),
    goods,
    costs: costTotal,
    total: toMoney(goods + costTotal),
    allocationError,
  };
}
