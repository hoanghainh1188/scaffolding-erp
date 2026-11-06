// What D1 writes for amounts, goods and months (spec dashboard, domain-values).
import { piecesText, tonsText } from "@/domain/dashboard";
import { formatMoney, toMoney } from "@/domain/money";

export const money = (value: number): string => formatMoney(toMoney(value));

/** "1.240 cái" */
export const pieces = (piecesMilli: number): string =>
  `${piecesText(piecesMilli)} cái`;

/** "18,6 tấn" */
export const tons = (kgMilli: number): string => `${tonsText(kgMilli)} tấn`;

/** "2026-11" → "T11" (chart), "tháng 11" (text). */
export const monthShort = (month: string): string =>
  `T${Number(month.slice(5, 7))}`;
export const monthName = (month: string): string =>
  `tháng ${Number(month.slice(5, 7))}`;
