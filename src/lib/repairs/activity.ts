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
import { formatQuantity, quantityFromDb } from "@/domain/quantity";
import { moneyText } from "@/lib/activity/fields";

type Executor = Pick<Database, "select">;

export interface RepairLineView {
  code: string;
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

const pieces = (value: string) =>
  `${formatQuantity(quantityFromDb(value, "KG"))} cái`;

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
      `lấy ${pieces(line.taken)}`,
      `${pieces(line.good)} Tốt`,
      `${pieces(line.scrap)} phế liệu`,
      `chi phí ${moneyText(line.repairCost)}`,
    ),
  columns: [
    { field: "taken", label: "Số lấy ra", value: (l) => pieces(l.taken) },
    { field: "good", label: "Về Tốt", value: (l) => pieces(l.good) },
    { field: "scrap", label: "Phế liệu", value: (l) => pieces(l.scrap) },
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
  return { ...head, lines };
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

const sumPieces = (values: readonly string[]) =>
  formatQuantity({
    unit: "KG",
    milli: values.reduce((sum, v) => sum + quantityFromDb(v, "KG").milli, 0),
  });

/** "2 mã hàng · lấy 60 cái từ XUONG-01". */
export function draftSummary(view: RepairView): string {
  return joinParts(
    countText(view.lines.length, "mã hàng"),
    `lấy ${sumPieces(view.lines.map((line) => line.taken))} cái từ ${view.from}`,
  );
}

/** "56 cái về Tốt, 4 phế liệu · chi phí 2.220.000 ₫" (D18). */
export function postedSummary(view: RepairView, confirmed: string | null) {
  const cost = view.lines.reduce((sum, line) => sum + line.repairCost, 0);
  return joinParts(
    `${sumPieces(view.lines.map((l) => l.good))} cái về Tốt, ${sumPieces(view.lines.map((l) => l.scrap))} phế liệu`,
    `chi phí ${moneyText(cost)}`,
    confirmed,
  );
}
