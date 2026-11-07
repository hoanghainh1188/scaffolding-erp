// The money of a work order on D12 (repair-work-orders spec "Số tiền trên
// D12 trước và sau ghi sổ"): a preview from today's averages and the supply
// stock at the workshop before posting, the posted figures after. Pure, so
// the page and its tests share it.
import { formatMoney, toMoney, type Money } from "@/domain/money";
import { costRepairLine, type RepairLineCost } from "@/domain/repair-order";
import {
  issueAmount,
  laborAmount,
  splitMaterialIssue,
} from "@/domain/repair-work-order";
import type { WorkLine, WorkOrderDetail } from "@/lib/repairs/work-queries";

export interface MaterialFigure {
  itemId: string;
  code: string;
  name: string;
  quantityMilli: number;
  /** ₫ per unit used (blend when New and Good both go). */
  unitCost: Money;
  amount: Money;
}

export interface WorkLineFigures {
  line: WorkLine;
  labor: Money;
  material: Money;
  cost: Money;
  materials: MaterialFigure[];
  /** Null when the numbers are not in yet or a price is missing. */
  repair: RepairLineCost | null;
  /** Why there is no figure ("Chưa có giá sắt vụn…"). */
  problem: string | null;
}

/** The workshop has reported: the numbers can be costed. */
export function hasNumbers(status: WorkOrderDetail["status"]): boolean {
  return (
    status === "AWAITING_CHECK" || status === "COUNTED" || status === "POSTED"
  );
}

function unitCostOf(amount: Money, milli: number): Money {
  return milli === 0
    ? toMoney(0)
    : toMoney(Math.round((amount * 1000) / milli));
}

function postedLine(detail: WorkOrderDetail, line: WorkLine): WorkLineFigures {
  const materials = line.materials.map((material) => {
    const amount = material.amount ?? toMoney(0);
    return {
      itemId: material.itemId,
      code: material.code,
      name: material.name,
      quantityMilli: material.quantityMilli,
      unitCost: unitCostOf(amount, material.quantityMilli),
      amount,
    };
  });
  const B = line.postedNeedsRepairCost;
  const repair =
    B === null
      ? null
      : costRepairLine(
          {
            itemCode: line.code,
            goodMilli: line.goodMilli,
            scrapMilli: line.scrapMilli,
            repairCost: line.repairCost,
          },
          {
            needsRepairAvg: B,
            standardWeightKg: line.standardWeightKg,
            scrapPricePerKg: detail.scrapPriceUsed,
          },
        );
  return {
    line,
    labor: line.laborAmount ?? toMoney(0),
    material: line.materialAmount,
    cost: line.repairCost,
    materials,
    repair,
    problem: null,
  };
}

/** Every line of the order, in order; supplies drawn New first like posting. */
export function workFigures(detail: WorkOrderDetail): WorkLineFigures[] {
  if (detail.status === "POSTED") {
    return detail.lines.map((line) => postedLine(detail, line));
  }
  const left = new Map(
    detail.supplies.map((supply) => [
      supply.itemId,
      { newMilli: supply.newMilli, goodMilli: supply.goodMilli },
    ]),
  );
  const average = (itemId: string, condition: string) =>
    detail.averages[`${itemId}|${condition}`] ?? null;
  return detail.lines.map((line) => {
    let problem: string | null = null;
    const materials = line.materials.map((material) => {
      const stock = left.get(material.itemId) ?? { newMilli: 0, goodMilli: 0 };
      let split = { newMilli: material.quantityMilli, goodMilli: 0 };
      try {
        split = splitMaterialIssue(material.quantityMilli, stock, {
          itemCode: material.code,
          unit: material.unit,
          locationCode: detail.workshop.code,
        });
      } catch (error) {
        problem ??= error instanceof Error ? error.message : String(error);
      }
      left.set(material.itemId, {
        newMilli: Math.max(stock.newMilli - split.newMilli, 0),
        goodMilli: Math.max(stock.goodMilli - split.goodMilli, 0),
      });
      const amount = toMoney(
        (split.newMilli > 0
          ? issueAmount(
              split.newMilli,
              average(material.itemId, "NEW") ?? toMoney(0),
            )
          : 0) +
          (split.goodMilli > 0
            ? issueAmount(
                split.goodMilli,
                average(material.itemId, "GOOD") ?? toMoney(0),
              )
            : 0),
      );
      return {
        itemId: material.itemId,
        code: material.code,
        name: material.name,
        quantityMilli: material.quantityMilli,
        unitCost: unitCostOf(amount, material.quantityMilli),
        amount,
      };
    });
    const material = toMoney(
      materials.reduce((sum, row) => sum + row.amount, 0),
    );
    const labor =
      line.laborRate === null
        ? toMoney(0)
        : laborAmount(line.goodMilli, line.laborRate);
    const cost = toMoney(labor + material);
    let repair: RepairLineCost | null = null;
    const B = average(line.itemId, "NEEDS_REPAIR");
    if (hasNumbers(detail.status) && B !== null) {
      try {
        repair = costRepairLine(
          {
            itemCode: line.code,
            goodMilli: line.goodMilli,
            scrapMilli: line.scrapMilli,
            repairCost: cost,
          },
          {
            needsRepairAvg: B,
            standardWeightKg: line.standardWeightKg,
            scrapPricePerKg: detail.scrapPricePerKg,
          },
        );
      } catch (error) {
        problem ??= error instanceof Error ? error.message : String(error);
      }
    }
    return { line, labor, material, cost, materials, repair, problem };
  });
}

/** "36 × 40.000 ₫ = 1.440.000 ₫". */
export function laborText(
  goodMilli: number,
  rate: Money | null,
  labor: Money,
): string {
  if (rate === null) return "Chưa có đơn giá công";
  return `${(goodMilli / 1000).toLocaleString("vi-VN")} × ${formatMoney(rate)} = ${formatMoney(labor)}`;
}
