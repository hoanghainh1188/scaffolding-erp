// The D12 rows as typed → the request body and the error shown under each
// row (spec scenario "Báo lỗi ngay trên dòng"). Same rules as the server.
import { DomainValueError } from "@/domain/errors";
import { parseMoney } from "@/domain/money";
import { parseQuantity, quantityToDb } from "@/domain/quantity";
import {
  RepairFieldError,
  checkRepairLines,
  type RepairLineInput,
} from "@/domain/repair-order";
import type { AwaitingItem } from "@/lib/repairs/queries";

import type { DraftLine } from "./repair-lines";

export interface ReadLine {
  body: {
    itemId: string;
    quantityTaken: string;
    quantityGood: string;
    quantityScrap: string;
    repairCost: number;
  };
  /** Null while the row breaks a rule. */
  input: RepairLineInput | null;
}

export interface ReadLines {
  rows: ReadLine[];
  valid: RepairLineInput[];
  rowErrors: Map<number, string>;
}

export const READ_MESSAGES = {
  taken: "Nhập số lấy ra sửa",
} as const;

/** "GG-K17: sửa xong + …" → "Sửa xong + …": the row already names it. */
function forRow(message: string, code: string): string {
  const text = message.startsWith(`${code}: `)
    ? message.slice(code.length + 2)
    : message;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function milli(text: string): number {
  return parseQuantity(text.trim() || "0", "KG").milli;
}

export function readLines(
  lines: readonly DraftLine[],
  facts: ReadonlyMap<string, AwaitingItem>,
): ReadLines {
  const rowErrors = new Map<number, string>();
  const valid: RepairLineInput[] = [];
  const rows = lines.map((line): ReadLine => {
    const code = facts.get(line.itemId)?.itemCode ?? "";
    let input: RepairLineInput | null = null;
    let body: ReadLine["body"] = {
      itemId: line.itemId,
      quantityTaken: line.taken,
      quantityGood: line.good,
      quantityScrap: line.scrap,
      repairCost: 0,
    };
    try {
      if (line.taken.trim() === "")
        throw new DomainValueError(READ_MESSAGES.taken);
      const taken = milli(line.taken);
      const good = milli(line.good);
      const scrap = milli(line.scrap);
      const cost = parseMoney(line.cost.trim() || "0");
      body = {
        itemId: line.itemId,
        quantityTaken: quantityToDb({ unit: "KG", milli: taken }),
        quantityGood: quantityToDb({ unit: "KG", milli: good }),
        quantityScrap: quantityToDb({ unit: "KG", milli: scrap }),
        repairCost: cost,
      };
      const candidate: RepairLineInput = {
        itemId: line.itemId,
        itemCode: code,
        unit: facts.get(line.itemId)?.unit ?? "PIECE",
        takenMilli: taken,
        goodMilli: good,
        scrapMilli: scrap,
        repairCost: cost,
      };
      checkRepairLines([candidate]);
      input = candidate;
      valid.push(candidate);
    } catch (error) {
      if (!(error instanceof DomainValueError)) throw error;
      rowErrors.set(
        line.key,
        error instanceof RepairFieldError
          ? forRow(error.message, code)
          : error.message,
      );
    }
    return { body, input };
  });
  return { rows, valid, rowErrors };
}
