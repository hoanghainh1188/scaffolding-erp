// A production order as the activity log sees it (spec activity-log): the
// phone steps carry no price; posting gives materials, labour and value.
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  item,
  location,
  productionOrder,
  productionOrderLine,
} from "@/db/schema";
import {
  diffFields,
  diffLines,
  type FieldChange,
  type FieldSpec,
  type LineSpec,
} from "@/domain/activity-changes";
import { countText, joinParts } from "@/domain/activity-summary";
import {
  formatByUnit,
  formatQuantity,
  QUANTITY_UNIT_LABELS,
  quantityFromDb,
  sumByUnit,
  type QuantityUnit,
} from "@/domain/quantity";
import {
  normMilli,
  overuse,
  overuseText,
  type PostingLine,
  type ProductionPosting,
} from "@/domain/production-order";
import { moneyText } from "@/lib/activity/fields";
import { unitFromDb } from "@/lib/inventory/unit";

type Executor = Pick<Database, "select">;

export interface ProductionLineView {
  code: string;
  unit: QuantityUnit;
  planned: string;
  reportedFinished: string | null;
  reportedOffcut: string | null;
  finished: string | null;
  offcut: string | null;
}

export interface ProductionView {
  team: string | null;
  note: string | null;
  workshop: string;
  to: string;
  lines: ProductionLineView[];
}

const withUnit = (value: string, unit: QuantityUnit) =>
  `${formatQuantity(quantityFromDb(value, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;

const bare = (value: string, unit: QuantityUnit) =>
  formatQuantity(quantityFromDb(value, unit));

const HEAD: readonly FieldSpec<ProductionView>[] = [
  { field: "team", label: "Tổ làm", value: (order) => order.team },
  { field: "note", label: "Ghi chú", value: (order) => order.note },
  { field: "workshop", label: "Xưởng", value: (order) => order.workshop },
  { field: "to", label: "Bãi nhận", value: (order) => order.to },
];

const LINES: LineSpec<ProductionLineView> = {
  field: "lines",
  key: (line) => line.code,
  whole: (line) => `kế hoạch ${withUnit(line.planned, line.unit)}`,
  columns: [
    {
      field: "planned",
      label: "Số kế hoạch",
      value: (line) => withUnit(line.planned, line.unit),
    },
  ],
};

const workshop = alias(location, "activity_workshop");
const yard = alias(location, "activity_yard");

export async function productionView(
  tx: Executor,
  orderId: string,
): Promise<ProductionView> {
  const [[head], lines] = await Promise.all([
    tx
      .select({
        team: productionOrder.team,
        note: productionOrder.note,
        workshop: workshop.code,
        to: yard.code,
      })
      .from(productionOrder)
      .innerJoin(workshop, eq(workshop.id, productionOrder.workshopId))
      .innerJoin(yard, eq(yard.id, productionOrder.toLocationId))
      .where(eq(productionOrder.id, orderId)),
    tx
      .select({
        code: item.code,
        unit: item.unit,
        planned: productionOrderLine.quantityPlanned,
        reportedFinished: productionOrderLine.reportedFinished,
        reportedOffcut: productionOrderLine.reportedOffcutKg,
        finished: productionOrderLine.quantityFinished,
        offcut: productionOrderLine.offcutKg,
      })
      .from(productionOrderLine)
      .innerJoin(item, eq(item.id, productionOrderLine.itemId))
      .where(eq(productionOrderLine.orderId, orderId))
      .orderBy(asc(productionOrderLine.position)),
  ]);
  if (!head) throw new Error(`production order ${orderId} not found`);
  return {
    ...head,
    lines: lines.map((line) => ({ ...line, unit: unitFromDb(line.unit) })),
  };
}

export function productionChanges(
  before: ProductionView,
  after: ProductionView,
): FieldChange[] {
  return [
    ...diffFields(HEAD, before, after),
    ...diffLines(LINES, before.lines, after.lines),
  ];
}

type Pick3 = "planned" | "finished" | "reportedFinished";

function total(lines: readonly ProductionLineView[], pick: Pick3): string {
  return formatByUnit(
    sumByUnit(
      lines.flatMap((line) => {
        const value = line[pick];
        return value === null
          ? []
          : [
              {
                unit: line.unit,
                milli: quantityFromDb(value, line.unit).milli,
              },
            ];
      }),
    ),
  );
}

function offcutText(
  lines: readonly ProductionLineView[],
  pick: "offcut" | "reportedOffcut",
): string {
  const milli = lines.reduce(
    (sum, line) => sum + quantityFromDb(line[pick] ?? "0", "KG").milli,
    0,
  );
  return `${formatQuantity({ unit: "KG", milli })} kg đầu thừa`;
}

/** "2 thành phẩm · 300 cái". */
export function draftSummary(view: ProductionView): string {
  return joinParts(
    countText(view.lines.length, "thành phẩm"),
    total(view.lines, "planned"),
  );
}

/** "XUONG-01 → BAI-01 · tổ anh Lực · 2 thành phẩm · 300 cái". */
export function assignSummary(view: ProductionView): string {
  return joinParts(
    `${view.workshop} → ${view.to}`,
    view.team,
    countText(view.lines.length, "thành phẩm"),
    total(view.lines, "planned"),
  );
}

/** "300 cái làm xong · 47 kg đầu thừa · 7 nguyên liệu" (Báo làm xong). */
export function reportSummary(view: ProductionView, materials: number): string {
  return joinParts(
    `${total(view.lines, "reportedFinished")} làm xong`,
    offcutText(view.lines, "reportedOffcut"),
    materials > 0 && countText(materials, "nguyên liệu"),
  );
}

/** "GG-K17: xưởng báo 102, đếm 100", or the totals when nothing differs. */
export function countSummary(view: ProductionView): string {
  const differences = view.lines
    .filter(
      (line) =>
        line.reportedFinished !== null &&
        line.finished !== null &&
        quantityFromDb(line.reportedFinished, line.unit).milli !==
          quantityFromDb(line.finished, line.unit).milli,
    )
    .map(
      (line) =>
        `${line.code}: xưởng báo ${bare(line.reportedFinished ?? "0", line.unit)}, đếm ${bare(line.finished ?? "0", line.unit)}`,
    );
  return differences.length > 0
    ? differences.join("; ")
    : joinParts(
        `${total(view.lines, "finished")} làm xong`,
        offcutText(view.lines, "offcut"),
      );
}

/** "VT-ONG27 (GG-K17) + 8,6 %" for each material over the limit. */
export function overuseSummary(lines: readonly PostingLine[]): string {
  return lines
    .flatMap((line) =>
      line.materials.flatMap((material) => {
        const norm =
          material.normPerUnitMilli === null
            ? 0
            : normMilli(
                material.normPerUnitMilli,
                line.finishedMilli,
                material.unit,
              );
        const result = overuse(material.quantityMilli, norm);
        if (!result.over) return [];
        const amount =
          result.percentTenths === null
            ? "ngoài định mức"
            : overuseText(result.percentTenths);
        return [`${material.itemCode} (${line.itemCode}) ${amount}`];
      }),
    )
    .join(", ");
}

/** "300 cái Mới về BAI-01, 47 kg phế liệu · nguyên liệu … · thành phẩm …". */
export function postedSummary(
  view: ProductionView,
  totals: ProductionPosting["totals"],
): string {
  const offcut = formatQuantity({ unit: "KG", milli: totals.offcutMilli });
  return joinParts(
    `${total(view.lines, "finished")} Mới về ${view.to}, ${offcut} kg phế liệu`,
    `nguyên liệu ${moneyText(totals.material)}, công ${moneyText(totals.labor)}`,
    `thành phẩm ${moneyText(totals.finished)}`,
  );
}
