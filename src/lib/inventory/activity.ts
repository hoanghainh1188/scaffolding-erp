// An adjustment or opening balance as the activity log sees it
// (activity-log design D6).
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/client";
import {
  item,
  location,
  stockAdjustment,
  stockAdjustmentLine,
} from "@/db/schema";
import {
  diffFields,
  diffLines,
  type FieldChange,
  type FieldSpec,
  type LineSpec,
} from "@/domain/activity-changes";
import { countText, joinParts } from "@/domain/activity-summary";
import { formatBusinessDate } from "@/domain/business-date";
import { CONDITION_LABELS, type Condition } from "@/domain/condition";
import {
  formatQuantity,
  quantityFromDb,
  QUANTITY_UNIT_LABELS,
  type QuantityUnit,
} from "@/domain/quantity";
import { signedMoney } from "@/domain/stock-revaluation";
import { moneyText } from "@/lib/activity/fields";

type Executor = Pick<Database, "select">;

export interface AdjustmentLineView {
  /** "GG-K17 Tốt BAI-01", or "GG-K17 Chờ sửa → Tốt BAI-01". */
  key: string;
  unit: QuantityUnit;
  quantity: string;
  unitCost: number | null;
  valueDelta: number | null;
}

export interface AdjustmentView {
  reason: string;
  relatedDocumentCode: string | null;
  openingDate: string | null;
  correctedTripCost: number | null;
  lines: AdjustmentLineView[];
}

const HEAD: readonly FieldSpec<AdjustmentView>[] = [
  { field: "reason", label: "Lý do", value: (a) => a.reason },
  {
    field: "relatedDocumentCode",
    label: "Chứng từ liên quan",
    value: (a) => a.relatedDocumentCode,
  },
  {
    field: "openingDate",
    label: "Ngày tồn đầu",
    value: (a) => (a.openingDate ? formatBusinessDate(a.openingDate) : null),
  },
  {
    field: "correctedTripCost",
    label: "Chi phí chuyến đúng",
    value: (a) => moneyText(a.correctedTripCost),
  },
];

const quantityText = (line: AdjustmentLineView) =>
  `${formatQuantity(quantityFromDb(line.quantity, line.unit))} ${QUANTITY_UNIT_LABELS[line.unit]}`;

const LINES: LineSpec<AdjustmentLineView> = {
  field: "lines",
  key: (line) => line.key,
  whole: (line) =>
    line.valueDelta !== null
      ? `chênh lệch ${signedMoney(line.valueDelta)}`
      : joinParts(
          quantityText(line),
          line.unitCost === null ? null : `đơn giá ${moneyText(line.unitCost)}`,
        ),
  columns: [
    { field: "quantity", label: "Số lượng", value: quantityText },
    {
      field: "unitCost",
      label: "Đơn giá",
      value: (line) => moneyText(line.unitCost),
    },
    {
      field: "valueDelta",
      label: "Chênh lệch giá trị",
      value: (line) =>
        line.valueDelta === null ? null : signedMoney(line.valueDelta),
    },
  ],
};

const place = alias(location, "place");
const toPlace = alias(location, "to_place");

function lineKey(row: {
  code: string;
  condition: string;
  toCondition: string | null;
  place: string | null;
  toPlace: string | null;
}): string {
  const label = (condition: string) =>
    CONDITION_LABELS[condition as Condition] ?? condition;
  const condition = row.toCondition
    ? `${label(row.condition)} → ${label(row.toCondition)}`
    : label(row.condition);
  if (row.place === null) return `${row.code} ${condition}`;
  const where = row.toPlace ? `${row.place} → ${row.toPlace}` : row.place;
  return `${row.code} ${condition} ${where}`;
}

export async function adjustmentView(
  tx: Executor,
  id: string,
): Promise<AdjustmentView> {
  const [[head], lines] = await Promise.all([
    tx
      .select({
        reason: stockAdjustment.reason,
        relatedDocumentCode: stockAdjustment.relatedDocumentCode,
        openingDate: stockAdjustment.openingDate,
        correctedTripCost: stockAdjustment.correctedTripCost,
      })
      .from(stockAdjustment)
      .where(eq(stockAdjustment.id, id)),
    tx
      .select({
        code: item.code,
        unit: item.unit,
        condition: stockAdjustmentLine.condition,
        toCondition: stockAdjustmentLine.toCondition,
        place: place.code,
        toPlace: toPlace.code,
        quantity: stockAdjustmentLine.quantity,
        unitCost: stockAdjustmentLine.unitCost,
        valueDelta: stockAdjustmentLine.valueDelta,
      })
      .from(stockAdjustmentLine)
      .innerJoin(item, eq(item.id, stockAdjustmentLine.itemId))
      .leftJoin(place, eq(place.id, stockAdjustmentLine.locationId))
      .leftJoin(toPlace, eq(toPlace.id, stockAdjustmentLine.toLocationId))
      .where(eq(stockAdjustmentLine.adjustmentId, id))
      .orderBy(asc(stockAdjustmentLine.lineNo)),
  ]);
  if (!head) throw new Error(`stock adjustment ${id} not found`);
  return {
    ...head,
    lines: lines.map((line) => ({
      key: lineKey(line),
      unit: line.unit as QuantityUnit,
      quantity: line.quantity,
      unitCost: line.unitCost,
      valueDelta: line.valueDelta,
    })),
  };
}

export function adjustmentChanges(
  before: AdjustmentView,
  after: AdjustmentView,
): FieldChange[] {
  return [
    ...diffFields(HEAD, before, after),
    ...diffLines(LINES, before.lines, after.lines),
  ];
}

/** "3 dòng · Lý do: Kiểm đếm bãi"; value documents add the source and total. */
export function adjustmentSummary(view: AdjustmentView): string {
  const values = view.lines.filter((line) => line.valueDelta !== null);
  if (values.length > 0) {
    return joinParts(
      `Sửa ${view.relatedDocumentCode ?? ""}`,
      countText(view.lines.length, "dòng"),
      signedMoney(values.reduce((sum, l) => sum + (l.valueDelta ?? 0), 0)),
      view.reason,
    );
  }
  return joinParts(countText(view.lines.length, "dòng"), view.reason);
}
