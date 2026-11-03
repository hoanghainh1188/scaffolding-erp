// Rent arithmetic (contracts design D10, 0.2 #4, #39): daily price × actual
// days, the issue day not counted and the return day counted, never less
// than the contract's minimum. The month figure is for display only. Pure
// functions: rental-billing reuses them per period and per price segment.
import { roundHalfUp } from "./average-cost";
import { daysBetween, type BusinessDate } from "./business-date";
import { DomainValueError } from "./errors";
import { toMoney, type Money } from "./money";

/** 0.2 #39: the only place 45 is written. Contracts store their own copy. */
export const DEFAULT_MIN_RENTAL_DAYS = 45;

/** The months shown next to a day's rent: 30 and 31 days. */
export const MONTH_DISPLAY_DAYS = [30, 31] as const;

const MILLI = 1000n;

export const RENTAL_MESSAGES = {
  returnBeforeIssue: "Ngày trả không được trước ngày xuất.",
  endBeforeStart: "Ngày kết thúc phải sau ngày bắt đầu.",
} as const;

/** Days from the issue day to the return day: 01/11 → 21/11 is 20. */
export function rentalDays(
  issueDate: BusinessDate,
  returnDate: BusinessDate,
): number {
  const days = daysBetween(issueDate, returnDate);
  if (days < 0) throw new DomainValueError(RENTAL_MESSAGES.returnBeforeIssue);
  return days;
}

/** Days to charge: at least the minimum, nothing for a zero quantity. */
export function chargeableDays(
  days: number,
  minDays: number,
  quantityMilli: number,
): number {
  return quantityMilli === 0 ? 0 : Math.max(days, minDays);
}

export interface RentInput {
  /** ₫ per unit per day. */
  dailyPrice: number;
  /** Quantity in thousandths of the unit. */
  quantityMilli: number;
  days: number;
}

/** price × quantity × days, rounded to 1 ₫ (half up) for weighed goods. */
export function rentAmount({
  dailyPrice,
  quantityMilli,
  days,
}: RentInput): Money {
  return toMoney(
    Number(
      roundHalfUp(
        BigInt(dailyPrice) * BigInt(quantityMilli) * BigInt(days),
        MILLI,
      ),
    ),
  );
}

export interface PricedQuantity {
  dailyPrice: number;
  quantityMilli: number;
}

/** "Tiền thuê 1 ngày": Σ quantity × daily price, rounded once. */
export function dailyTotal(lines: readonly PricedQuantity[]): Money {
  const exact = lines.reduce(
    (sum, line) => sum + BigInt(line.dailyPrice) * BigInt(line.quantityMilli),
    0n,
  );
  return toMoney(Number(roundHalfUp(exact, MILLI)));
}

/**
 * Change of "tiền thuê 1 ngày" when `added` arrives and `removed` leaves a
 * site (D6b, D6c, D6d): negative when the day gets cheaper.
 */
export function dailyChange(
  added: readonly PricedQuantity[],
  removed: readonly PricedQuantity[],
): number {
  return dailyTotal(added) - dailyTotal(removed);
}

export interface ExpectedValueInput {
  dailyTotal: number;
  startDate: BusinessDate;
  endDate: BusinessDate;
  minDays: number;
}

export interface ExpectedValue {
  days: number;
  /** True when the minimum, not the plan, gave the days. */
  minimumApplied: boolean;
  amount: Money;
}

/** D5 "Giá trị dự kiến": day's rent × max(planned days, minimum). */
export function expectedValue({
  dailyTotal: total,
  startDate,
  endDate,
  minDays,
}: ExpectedValueInput): ExpectedValue {
  const planned = daysBetween(startDate, endDate);
  if (planned <= 0) throw new DomainValueError(RENTAL_MESSAGES.endBeforeStart);
  const days = Math.max(planned, minDays);
  return {
    days,
    minimumApplied: planned < minDays,
    amount: toMoney(total * days),
  };
}

export interface MonthFigure {
  days: number;
  amount: Money;
}

/** "tháng 30 ngày ≈ …, tháng 31 ngày ≈ …": day's rent × days of the month. */
export function monthDisplay(total: number): MonthFigure[] {
  return MONTH_DISPLAY_DAYS.map((days) => ({
    days,
    amount: toMoney(total * days),
  }));
}
