// A repair slip as the activity log sees it (activity-log design D6).
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import { item, location, repairOrder, repairOrderLine } from "@/db/schema";
import {
  diffFields,
  diffLines,
  type FieldChange,
  type FieldSpec,
  type LineSpec,
} from "@/domain/activity-changes";
import { countText, joinParts } from "@/domain/activity-summary";
import { formatBusinessDate } from "@/domain/business-date";
import {
  formatQuantity,
  QUANTITY_UNIT_LABELS,
  quantityFromDb,
  type QuantityUnit,
} from "@/domain/quantity";
import { unitFromDb } from "@/lib/inventory/unit";
import { moneyText } from "@/lib/activity/fields";

type Executor = Pick<Database, "select">;

export interface RepairLineView {
  code: string;
  unit: QuantityUnit;
  taken: string;
  good: string;
  scrap: string;
  repairCost: number;
}

export interface RepairView {
  repairDate: string;
  repairedBy: string | null;
  note: string | null;
  from: string;
  to: string;
  lines: RepairLineView[];
}

const amount = (value: string, unit: QuantityUnit) =>
  formatQuantity(quantityFromDb(value, unit));

/** "40 cái", "5 bó": a line quantity in the item's own unit. */
const withUnit = (value: string, unit: QuantityUnit) =>
  `${amount(value, unit)} ${QUANTITY_UNIT_LABELS[unit]}`;

const HEAD: readonly FieldSpec<RepairView>[] = [
  {
    field: "repairDate",
    label: "Ngày sửa xong",
    value: (r) => formatBusinessDate(r.repairDate),
  },
  { field: "repairedBy", label: "Người sửa", value: (r) => r.repairedBy },
  { field: "note", label: "Ghi chú", value: (r) => r.note },
  { field: "from", label: "Lấy từ", value: (r) => r.from },
  { field: "to", label: "Nhập về", value: (r) => r.to },
];

const LINES: LineSpec<RepairLineView> = {
  field: "lines",
  key: (line) => line.code,
  whole: (line) =>
    joinParts(
      `lấy ${withUnit(line.taken, line.unit)}`,
      `${withUnit(line.good, line.unit)} Tốt`,
      `${withUnit(line.scrap, line.unit)} phế liệu`,
      `chi phí ${moneyText(line.repairCost)}`,
    ),
  columns: [
    {
      field: "taken",
      label: "Số lấy ra",
      value: (l) => withUnit(l.taken, l.unit),
    },
    { field: "good", label: "Về Tốt", value: (l) => withUnit(l.good, l.unit) },
    {
      field: "scrap",
      label: "Phế liệu",
      value: (l) => withUnit(l.scrap, l.unit),
    },
    {
      field: "repairCost",
      label: "Chi phí sửa",
      value: (l) => moneyText(l.repairCost),
    },
  ],
};

const fromPlace = alias(location, "from_place");
const toPlace = alias(location, "to_place");

export async function repairView(
  tx: Executor,
  orderId: string,
): Promise<RepairView> {
  const [[head], lines] = await Promise.all([
    tx
      .select({
        repairDate: repairOrder.repairDate,
        repairedBy: repairOrder.repairedBy,
        note: repairOrder.note,
        from: fromPlace.code,
        to: toPlace.code,
      })
      .from(repairOrder)
      .innerJoin(fromPlace, eq(fromPlace.id, repairOrder.fromLocationId))
      .innerJoin(toPlace, eq(toPlace.id, repairOrder.toLocationId))
      .where(eq(repairOrder.id, orderId)),
    tx
      .select({
        code: item.code,
        unit: item.unit,
        taken: repairOrderLine.quantityTaken,
        good: repairOrderLine.quantityGood,
        scrap: repairOrderLine.quantityScrap,
        repairCost: repairOrderLine.repairCost,
      })
      .from(repairOrderLine)
      .innerJoin(item, eq(item.id, repairOrderLine.itemId))
      .where(eq(repairOrderLine.orderId, orderId))
      .orderBy(asc(repairOrderLine.position)),
  ]);
  if (!head) throw new Error(`repair order ${orderId} not found`);
  return {
    ...head,
    lines: lines.map((line) => ({ ...line, unit: unitFromDb(line.unit) })),
  };
}

export function repairChanges(
  before: RepairView,
  after: RepairView,
): FieldChange[] {
  return [
    ...diffFields(HEAD, before, after),
    ...diffLines(LINES, before.lines, after.lines),
  ];
}

type LineQuantity = "taken" | "good" | "scrap";

/**
 * Σ of one quantity per unit, never adding cái to bó: "60 cái",
 * "40 cái, 5 bó". `bare` drops the label when every line shares one unit
 * ("4 phế liệu").
 */
export function sumByUnit(
  lines: readonly RepairLineView[],
  pick: LineQuantity,
  bare = false,
): string {
  const totals = new Map<QuantityUnit, number>();
  for (const line of lines) {
    const milli = quantityFromDb(line[pick], line.unit).milli;
    totals.set(line.unit, (totals.get(line.unit) ?? 0) + milli);
  }
  if (totals.size === 0) return bare ? "0" : `0 ${QUANTITY_UNIT_LABELS.PIECE}`;
  const parts = [...totals].map(([unit, milli]) => {
    const text = formatQuantity({ unit, milli });
    return bare && totals.size === 1
      ? text
      : `${text} ${QUANTITY_UNIT_LABELS[unit]}`;
  });
  return parts.join(", ");
}

/** "2 mã hàng · lấy 60 cái từ XUONG-01". */
export function draftSummary(view: RepairView): string {
  return joinParts(
    countText(view.lines.length, "mã hàng"),
    `lấy ${sumByUnit(view.lines, "taken")} từ ${view.from}`,
  );
}

/** "56 cái về Tốt, 4 phế liệu · chi phí 2.220.000 ₫" (D18). */
export function postedSummary(view: RepairView, confirmed: string | null) {
  const cost = view.lines.reduce((sum, line) => sum + line.repairCost, 0);
  return joinParts(
    `${sumByUnit(view.lines, "good")} về Tốt, ${sumByUnit(view.lines, "scrap", true)} phế liệu`,
    `chi phí ${moneyText(cost)}`,
    confirmed,
  );
}

// Work orders (repair-work-orders spec activity-log): the phone steps carry
// no price; posting gives labour, supplies and the repair cost.

/** "XUONG-01 · tổ anh Lực · 2 mã hàng · 60 cái" (Giao xưởng). */
export function assignSummary(view: RepairView): string {
  return joinParts(
    view.to,
    view.repairedBy,
    countText(view.lines.length, "mã hàng"),
    sumByUnit(view.lines, "taken"),
  );
}

/** "BAI-01 → XUONG-01 · 60 cái" (Nhận lệnh, Hủy after receiving). */
export function moveSummary(
  view: RepairView,
  direction: "receive" | "cancel",
): string {
  const path =
    direction === "receive"
      ? `${view.from} → ${view.to}`
      : `${view.to} → ${view.from}`;
  return joinParts(path, sumByUnit(view.lines, "taken"));
}

/** "56 cái sửa xong, 4 phế · 3 vật tư" (Báo sửa xong, Đếm xong). */
export function reportSummary(view: RepairView, materials: number): string {
  return joinParts(
    `${sumByUnit(view.lines, "good")} sửa xong, ${sumByUnit(view.lines, "scrap", true)} phế`,
    materials > 0 && countText(materials, "vật tư"),
  );
}

/** "GG-K17: xưởng báo 36 / 4, đếm 35 / 5" for lines the count changed. */
export function countDifferences(
  lines: readonly {
    code: string;
    unit: QuantityUnit;
    reportedGood: string;
    reportedScrap: string;
    good: string;
    scrap: string;
  }[],
): string | null {
  const parts = lines
    .filter(
      (line) =>
        quantityFromDb(line.reportedGood, line.unit).milli !==
          quantityFromDb(line.good, line.unit).milli ||
        quantityFromDb(line.reportedScrap, line.unit).milli !==
          quantityFromDb(line.scrap, line.unit).milli,
    )
    .map(
      (line) =>
        `${line.code}: xưởng báo ${amount(line.reportedGood, line.unit)} / ${amount(line.reportedScrap, line.unit)}, đếm ${amount(line.good, line.unit)} / ${amount(line.scrap, line.unit)}`,
    );
  return parts.length > 0 ? parts.join("; ") : null;
}

/** "56 cái về Tốt, 4 phế liệu · công 1.640.000 ₫, vật tư 585.000 ₫ · chi phí 2.225.000 ₫". */
export function workPostedSummary(
  view: RepairView,
  totals: { labor: number; material: number },
  confirmed: string | null,
): string {
  return joinParts(
    `${sumByUnit(view.lines, "good")} về Tốt, ${sumByUnit(view.lines, "scrap", true)} phế liệu`,
    `công ${moneyText(totals.labor)}, vật tư ${moneyText(totals.material)}`,
    `chi phí ${moneyText(totals.labor + totals.material)}`,
    confirmed,
  );
}
