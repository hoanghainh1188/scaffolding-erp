// The numbers of D20: posted orders read what was fixed, open ones are
// worked out from today's averages and stock with the same rules as posting
// ("tạm tính", design D5). Pure.
import { unitCostOf } from "@/domain/average-cost";
import { toMoney, type Money } from "@/domain/money";
import {
  normMilli,
  overuse,
  overuseValue,
  previewProductionCost,
  type PostingLine,
  type PostingStock,
} from "@/domain/production-order";
import type { QuantityUnit } from "@/domain/quantity";
import type {
  ProductionDetail,
  ProductionLineDetail,
  ProductionMaterialView,
} from "@/lib/production/queries";

export interface MaterialFigure {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  normMilli: number;
  /** Null while nobody has reported this material. */
  actualMilli: number | null;
  /** What the workshop reported, when the storekeeper wrote another number. */
  reportedOtherMilli: number | null;
  percentTenths: number | null;
  over: boolean;
  amount: Money;
}

export interface LineFigure {
  line: ProductionLineDetail;
  /** The pieces the figures are for: counted, else reported, else planned. */
  finishedMilli: number;
  offcutMilli: number;
  /** Which number that is. */
  source: "count" | "report" | "plan";
  materials: MaterialFigure[];
  materialAmount: Money;
  laborAmount: Money;
  offcutAmount: Money;
  finishedAmount: Money;
  /** Null when nothing was finished. */
  unitCost: Money | null;
}

export interface OrderFigures {
  provisional: boolean;
  lines: LineFigure[];
  totals: {
    finishedMilli: number;
    offcutMilli: number;
    material: Money;
    labor: Money;
    offcut: Money;
    finished: Money;
    overuse: Money;
  };
}

function piecesOf(line: ProductionLineDetail) {
  if (line.finishedMilli !== null) {
    return {
      finishedMilli: line.finishedMilli,
      offcutMilli: line.offcutMilli ?? 0,
      source: "count" as const,
    };
  }
  if (line.reportedFinishedMilli !== null) {
    return {
      finishedMilli: line.reportedFinishedMilli,
      offcutMilli: line.reportedOffcutMilli ?? 0,
      source: "report" as const,
    };
  }
  return {
    finishedMilli: line.plannedMilli,
    offcutMilli: 0,
    source: "plan" as const,
  };
}

const norm = (material: ProductionMaterialView, finishedMilli: number) =>
  material.normPerUnitMilli === null
    ? 0
    : normMilli(material.normPerUnitMilli, finishedMilli, material.unit);

function postingLineOf(line: ProductionLineDetail): PostingLine {
  const pieces = piecesOf(line);
  return {
    lineId: line.lineId,
    itemId: line.itemId,
    itemCode: line.code,
    unit: line.unit,
    finishedMilli: pieces.finishedMilli,
    offcutMilli: pieces.offcutMilli,
    laborRate: line.laborRate,
    materials: line.materials.map((material) => ({
      rowId: material.rowId ?? material.itemId,
      itemId: material.itemId,
      itemCode: material.code,
      unit: material.unit,
      standardWeightKg: material.standardWeightKg,
      quantityMilli:
        material.quantityMilli ??
        material.reportedMilli ??
        norm(material, pieces.finishedMilli),
      normPerUnitMilli: material.normPerUnitMilli,
    })),
  };
}

function stockMap(detail: ProductionDetail): Map<string, PostingStock> {
  const held = new Map(detail.stock.map((row) => [row.itemId, row]));
  const result = new Map<string, PostingStock>();
  for (const line of detail.lines) {
    for (const material of line.materials) {
      result.set(material.itemId, {
        newMilli: held.get(material.itemId)?.newMilli ?? 0,
        goodMilli: held.get(material.itemId)?.goodMilli ?? 0,
        newAvg: material.newAvg,
        goodAvg: material.goodAvg,
      });
    }
  }
  return result;
}

const money = (value: number) => toMoney(value);

function materialFigures(
  line: ProductionLineDetail,
  finishedMilli: number,
  amounts: ReadonlyMap<string, number>,
): MaterialFigure[] {
  return line.materials.map((material) => {
    const actual = material.quantityMilli ?? material.reportedMilli;
    const target = norm(material, finishedMilli);
    const result = overuse(actual ?? 0, target);
    const other =
      material.quantityMilli !== null &&
      material.reportedMilli !== null &&
      material.reportedMilli !== material.quantityMilli
        ? material.reportedMilli
        : null;
    return {
      itemId: material.itemId,
      code: material.code,
      name: material.name,
      unit: material.unit,
      normMilli: target,
      actualMilli: actual,
      reportedOtherMilli: other,
      percentTenths: actual === null ? null : result.percentTenths,
      over: actual !== null && result.over,
      amount: money(amounts.get(material.itemId) ?? 0),
    };
  });
}

function averageOf(line: LineFigure, material: MaterialFigure): Money | null {
  if (material.actualMilli && material.amount) {
    return unitCostOf(material.amount, material.actualMilli);
  }
  const view = line.line.materials.find((m) => m.itemId === material.itemId);
  return view?.newAvg ?? view?.goodAvg ?? null;
}

function total(
  detail: ProductionDetail,
  lines: LineFigure[],
  provisional: boolean,
): OrderFigures {
  const sum = (pick: (line: LineFigure) => number) =>
    lines.reduce((value, line) => value + pick(line), 0);
  return {
    provisional,
    lines,
    totals: {
      finishedMilli: sum((line) => line.finishedMilli),
      offcutMilli: sum((line) => line.offcutMilli),
      material: money(sum((line) => line.materialAmount)),
      labor: money(sum((line) => line.laborAmount)),
      offcut: money(sum((line) => line.offcutAmount)),
      finished: money(sum((line) => line.finishedAmount)),
      overuse: overuseValue(
        lines.flatMap((line) =>
          line.materials.map((material) => ({
            actualMilli: material.actualMilli ?? 0,
            normMilli: material.normMilli,
            avgCost: averageOf(line, material),
          })),
        ),
      ),
    },
  };
}

function unitCost(amount: number, finishedMilli: number): Money | null {
  return finishedMilli > 0 ? unitCostOf(money(amount), finishedMilli) : null;
}

export function orderFigures(detail: ProductionDetail): OrderFigures {
  if (detail.status === "POSTED") {
    const lines = detail.lines.map((line): LineFigure => {
      const pieces = piecesOf(line);
      const amounts = new Map(
        line.materials.map((m) => [m.itemId, m.amount ?? 0]),
      );
      const finishedAmount = line.finishedAmount ?? money(0);
      return {
        line,
        ...pieces,
        materials: materialFigures(line, pieces.finishedMilli, amounts),
        materialAmount: line.materialAmount ?? money(0),
        laborAmount: line.laborAmount ?? money(0),
        offcutAmount: line.offcutAmount ?? money(0),
        finishedAmount,
        unitCost: unitCost(finishedAmount, pieces.finishedMilli),
      };
    });
    return total(detail, lines, false);
  }
  const postingLines = detail.lines.map(postingLineOf);
  const preview = previewProductionCost(postingLines, {
    orderCode: detail.code,
    workshopId: detail.workshop.id,
    workshopCode: detail.workshop.code,
    toLocationId: detail.to.id,
    scrapItemId: detail.scrapItemId,
    scrapPricePerKg: detail.scrapPricePerKg,
    stock: stockMap(detail),
  });
  const lines = detail.lines.map((line, index): LineFigure => {
    const pieces = piecesOf(line);
    const costed = preview[index];
    const amounts = new Map(
      (costed?.materials ?? []).map((m) => [m.itemId, m.amount]),
    );
    const finishedAmount = costed?.finishedAmount ?? money(0);
    return {
      line,
      ...pieces,
      materials: materialFigures(line, pieces.finishedMilli, amounts),
      materialAmount: costed?.materialAmount ?? money(0),
      laborAmount: costed?.laborAmount ?? money(0),
      offcutAmount: costed?.offcutAmount ?? money(0),
      finishedAmount,
      unitCost:
        finishedAmount > 0
          ? unitCost(finishedAmount, pieces.finishedMilli)
          : null,
    };
  });
  return total(detail, lines, true);
}
