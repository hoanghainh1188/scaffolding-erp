// State of M5 "Nhặt hàng xuất kho" (delivery-picking spec, deliveries
// design D13): what the storekeeper typed per line and condition, the
// progress shown, the shortage question and the body sent to the server.
import type { Condition } from "@/domain/condition";
import {
  cappedEstimateText,
  estimatedPieces,
  lineProgress,
  type PickInput,
  type PickLine,
} from "@/domain/delivery-note";
import { DomainValueError } from "@/domain/errors";
import {
  formatQuantity,
  formatQuantityForInput,
  hasStandardWeight,
  parseQuantity,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { withinTolerance, WEIGHT_TOLERANCE_PERCENT } from "@/domain/tolerance";
import type { MobileLine } from "@/lib/deliveries/queries";
import type { PostDeliveryBody } from "@/lib/deliveries/post";

export interface LinePicks {
  /** Typed quantity per condition, in the item's unit. */
  quantities: Partial<Record<Condition, string>>;
  /** Kg on the scale (sale lines by kg). */
  weighedKg: string;
  piecesEstimated: boolean;
}

export interface PickingPayload {
  noteId: string;
  code: string;
  /** updated_at of the note when picking started. */
  startedVersion: string;
  vehiclePlate: string;
  lines: Record<string, LinePicks>;
  /** Set when "Xác nhận xe rời bãi" was tapped. */
  departedAt: string | null;
  /** The body sent once confirmed (the outbox reads `body`). */
  body?: PostDeliveryBody;
}

const amount = (milli: number, unit: QuantityUnit) =>
  `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;

function milliOf(text: string | undefined, unit: QuantityUnit): number {
  if (!text || text.trim() === "") return 0;
  try {
    return Math.max(parseQuantity(text, unit).milli, 0);
  } catch (error: unknown) {
    if (error instanceof DomainValueError) return Number.NaN;
    throw error;
  }
}

export const emptyPicks = (): LinePicks => ({
  quantities: {},
  weighedKg: "",
  piecesEstimated: false,
});

/** The picks of one line as the pure rules want them. */
export function pickLineOf(line: MobileLine, picks: LinePicks): PickLine {
  const weighed =
    line.byKg && hasStandardWeight(line.unit)
      ? milliOf(picks.weighedKg, "KG")
      : null;
  const inputs: PickInput[] = Object.entries(picks.quantities).flatMap(
    ([condition, text]) => {
      const milli = milliOf(text, line.unit);
      return milli > 0
        ? [
            {
              condition: condition as Condition,
              quantityMilli: milli,
              weighedMilli: weighed !== null && weighed > 0 ? weighed : null,
              piecesEstimated: picks.piecesEstimated,
            },
          ]
        : [];
    },
  );
  return {
    lineId: line.id,
    itemCode: line.itemCode,
    unit: line.unit,
    condition:
      line.condition === null
        ? null
        : (line.condition as PickLine["condition"]),
    pricingUnit: line.byKg ? "KG" : line.condition === null ? null : "ITEM",
    requestedMilli: line.requestedMilli,
    picks: inputs,
  };
}

export interface LineView {
  pickedMilli: number;
  leftMilli: number;
  extraMilli: number;
  done: boolean;
  /** Shown under the line; blocks confirming. */
  error: string | null;
  /** "Đã nhặt đủ 120 cái", "Còn 40 cái", "Đã nhặt đủ · dư 7,5 kg". */
  status: string;
}

export function lineView(line: MobileLine, picks: LinePicks): LineView {
  const quantities = Object.values(picks.quantities).map((text) =>
    milliOf(text, line.unit),
  );
  if (quantities.some((milli) => Number.isNaN(milli))) {
    return {
      pickedMilli: 0,
      leftMilli: line.requestedMilli,
      extraMilli: 0,
      done: false,
      error: "Số không hợp lệ.",
      status: "",
    };
  }
  const progress = lineProgress(pickLineOf(line, picks));
  const unit = line.lineUnit;
  let error: string | null = null;
  if (line.byKg) {
    if (!withinTolerance(progress.pickedMilli, line.requestedMilli)) {
      error = `Kg cân vượt số cần quá ${WEIGHT_TOLERANCE_PERCENT} %. Văn phòng cần sửa phiếu.`;
    } else if (
      quantities.some((milli) => milli > 0) &&
      hasStandardWeight(line.unit) &&
      milliOf(picks.weighedKg, "KG") <= 0
    ) {
      error = "Bạn nhập số kg cân.";
    }
  } else if (progress.pickedMilli > line.requestedMilli) {
    error = `Dòng này chỉ cần ${amount(line.requestedMilli, unit)}.`;
  }
  const status = progress.done
    ? `Đã nhặt đủ ${amount(progress.pickedMilli, unit)}${progress.extraMilli > 0 ? ` · dư ${amount(progress.extraMilli, unit)}` : ""}`
    : progress.pickedMilli === 0
      ? `Cần ${amount(line.requestedMilli, unit)}`
      : `Còn ${amount(progress.leftMilli, unit)}`;
  return { ...progress, error, status };
}

/** "Đã nhặt 200 / 300 cái" by unit, for the header and M1. */
export function progressText(
  lines: readonly MobileLine[],
  payload: PickingPayload,
): string {
  const byUnit = new Map<QuantityUnit, { picked: number; needed: number }>();
  for (const line of lines) {
    const view = lineView(line, payload.lines[line.id] ?? emptyPicks());
    const row = byUnit.get(line.lineUnit) ?? { picked: 0, needed: 0 };
    row.picked += Math.min(view.pickedMilli, line.requestedMilli);
    row.needed += line.requestedMilli;
    byUnit.set(line.lineUnit, row);
  }
  return [...byUnit.entries()]
    .map(
      ([unit, row]) =>
        `${formatQuantity(toQuantity(row.picked, unit))} / ${amount(row.needed, unit)}`,
    )
    .join(", ");
}

/** "Còn 100 cái chưa nhặt. Xác nhận luôn thì phần thiếu chuyển sang đợt sau." */
export function shortageQuestion(
  lines: readonly MobileLine[],
  payload: PickingPayload,
): string | null {
  const byUnit = new Map<QuantityUnit, number>();
  for (const line of lines) {
    const view = lineView(line, payload.lines[line.id] ?? emptyPicks());
    if (view.leftMilli > 0)
      byUnit.set(
        line.lineUnit,
        (byUnit.get(line.lineUnit) ?? 0) + view.leftMilli,
      );
  }
  if (byUnit.size === 0) return null;
  const left = [...byUnit.entries()]
    .map(([unit, milli]) => amount(milli, unit))
    .join(", ");
  return `Còn ${left} chưa nhặt. Xác nhận luôn thì phần thiếu chuyển sang đợt sau.`;
}

/** Fills "Nhặt đủ": the need in the given condition, other conditions cleared. */
export function pickAll(
  line: MobileLine,
  condition: Condition,
): LinePicks["quantities"] {
  if (line.byKg) return {};
  return {
    [condition]: formatQuantityForInput(
      toQuantity(line.requestedMilli, line.unit),
    ),
  };
}

/** Scrap weighed but not counted: pieces from the kg, capped by yard stock. */
export function estimateFromKg(
  line: MobileLine,
  weighedText: string,
): { quantity: string; note: string | null } | null {
  if (line.condition !== "SCRAP" || line.standardWeightMilli === null)
    return null;
  const weighed = milliOf(weighedText, "KG");
  if (!(weighed > 0)) return null;
  const stock = line.stock.find((row) => row.condition === "SCRAP")?.milli ?? 0;
  const estimate = estimatedPieces(weighed, line.standardWeightMilli, stock);
  return {
    quantity: formatQuantityForInput(
      toQuantity(estimate.quantityMilli, line.unit),
    ),
    note: estimate.capped ? cappedEstimateText(estimate) : null,
  };
}

/** The condition a rental line starts with: the one with more stock. */
export function defaultCondition(line: MobileLine): Condition {
  if (line.condition !== null) return line.condition;
  const [first, second] = line.stock;
  return (second?.milli ?? 0) > (first?.milli ?? 0)
    ? (second?.condition ?? "GOOD")
    : (first?.condition ?? "GOOD");
}

/** The body of "Xác nhận xe rời bãi" (without the draft id). */
export function postBodyOf(
  lines: readonly MobileLine[],
  payload: PickingPayload,
  departedAt: string,
): PostDeliveryBody {
  return {
    startedVersion: payload.startedVersion,
    vehiclePlate: payload.vehiclePlate,
    departedAt,
    picks: lines.flatMap((line) => {
      const picks = payload.lines[line.id] ?? emptyPicks();
      return Object.entries(picks.quantities).flatMap(
        ([condition, quantity]) =>
          quantity && quantity.trim() !== "" && milliOf(quantity, line.unit) > 0
            ? [
                {
                  lineId: line.id,
                  condition,
                  quantity,
                  weighedKg: line.byKg ? picks.weighedKg : null,
                  piecesEstimated: picks.piecesEstimated,
                },
              ]
            : [],
      );
    }),
  };
}

/** Lines blocking the confirmation (over the need, missing kg...). */
export function blockingErrors(
  lines: readonly MobileLine[],
  payload: PickingPayload,
): string[] {
  return lines.flatMap((line) => {
    const error = lineView(line, payload.lines[line.id] ?? emptyPicks()).error;
    return error ? [`${line.itemCode}: ${error}`] : [];
  });
}
