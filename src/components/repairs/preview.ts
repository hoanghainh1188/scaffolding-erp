// Figures of the D12 "Giá vốn sau sửa" block (simple-repair design D11):
// from the averages now (draft preview) or from the ledger (posted slip).
// The same pure functions as the server, so the preview matches the books.
import { DomainValueError } from "@/domain/errors";
import { lineAmount } from "@/domain/average-cost";
import { toMoney, type Money } from "@/domain/money";
import type { QuantityUnit } from "@/domain/quantity";
import {
  costRepairLine,
  previewAverage,
  scrapKgMilli,
} from "@/domain/repair-order";
import type {
  AwaitingItem,
  PostedLineFigures,
  RepairLineRow,
} from "@/lib/repairs/queries";

export interface LineFigures {
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  goodMilli: number;
  scrapMilli: number;
  repairCost: Money;
  needsRepairAvg: Money;
  damage: Money;
  loss: Money;
  scrapValue: Money;
  scrapKgMilli: number;
  scrapPricePerKg: Money | null;
  goodUnitCost: Money | null;
  goodAvgBefore: Money | null;
  goodAvgAfter: Money | null;
}

/** A line as the form holds it, already read into numbers. */
export interface PreviewLine {
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  goodMilli: number;
  scrapMilli: number;
  repairCost: number;
}

export type Preview =
  { ok: true; figures: LineFigures } | { ok: false; reason: string };

export const PREVIEW_MESSAGES = {
  noAverage: "Mã này chưa có giá vốn Chờ sửa",
} as const;

/** Draft preview from the averages read when the page opened. */
export function previewLine(
  line: PreviewLine,
  facts: AwaitingItem | undefined,
  scrapPricePerKg: Money | null,
): Preview {
  if (!facts || facts.needsRepairAvg === null) {
    return { ok: false, reason: PREVIEW_MESSAGES.noAverage };
  }
  try {
    const cost = costRepairLine(
      { ...line, itemCode: line.itemCode },
      {
        needsRepairAvg: facts.needsRepairAvg,
        standardWeightKg: facts.standardWeightKg,
        scrapPricePerKg,
      },
    );
    const goodAvgAfter =
      line.goodMilli > 0
        ? previewAverage(
            { poolMilli: facts.goodPoolMilli, avgCost: facts.goodAvg },
            line.goodMilli,
            cost.goodAmount,
          )
        : null;
    return {
      ok: true,
      figures: {
        itemCode: line.itemCode,
        itemName: line.itemName,
        unit: line.unit,
        goodMilli: line.goodMilli,
        scrapMilli: line.scrapMilli,
        repairCost: toMoney(line.repairCost),
        needsRepairAvg: cost.needsRepairAvg,
        damage: cost.damage,
        loss: cost.loss,
        scrapValue: cost.scrapValue,
        scrapKgMilli: scrapKgMilli(line.scrapMilli, facts.standardWeightKg),
        scrapPricePerKg,
        goodUnitCost: cost.goodUnitCost,
        goodAvgBefore: line.goodMilli > 0 ? facts.goodAvg : null,
        goodAvgAfter,
      },
    };
  } catch (error) {
    if (error instanceof DomainValueError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}

/** A posted line: every figure as the ledger booked it. */
export function postedLine(
  line: RepairLineRow,
  posted: PostedLineFigures | undefined,
  scrapPricePerKg: Money | null,
): LineFigures {
  const needsRepairAvg = posted?.needsRepairAvg ?? toMoney(0);
  const scrapValue = posted?.scrapAmount ?? toMoney(0);
  return {
    itemCode: line.itemCode,
    itemName: line.itemName,
    unit: line.unit,
    goodMilli: line.goodMilli,
    scrapMilli: line.scrapMilli,
    repairCost: line.repairCost,
    needsRepairAvg,
    damage: toMoney(lineAmount(line.scrapMilli, needsRepairAvg) - scrapValue),
    loss: line.loss ?? toMoney(0),
    scrapValue,
    scrapKgMilli: scrapKgMilli(line.scrapMilli, line.standardWeightKg),
    scrapPricePerKg,
    goodUnitCost: posted?.goodUnitCost ?? null,
    goodAvgBefore: posted?.goodAvgBefore ?? null,
    goodAvgAfter: posted?.goodAvgAfter ?? null,
  };
}
