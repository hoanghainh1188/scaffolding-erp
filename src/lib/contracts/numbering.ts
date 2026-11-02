// Contract numbers (contracts design D7, 0.2 #40, #52): issued once, when a
// contract is first saved, in that transaction. The count lives in
// document_counter (no SEQUENCE, 0.2 #33): prefix "HĐ:<COMPANY>-<CUSTOMER>",
// and the `year` column holds YEAR × 100 + MONTH here (202611), not a year.
// The code is built by contractCode, not formatDocumentCode (that one
// writes "PN-2026-001").
import { desc, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { companyProfile, contract, documentCounter } from "@/db/schema";
import {
  CODE_MESSAGES,
  codeToken,
  contractCode,
  contractCodeBase,
  defaultCustomerToken,
} from "@/domain/contract-code";
import { ServiceFailure, conflict } from "@/lib/catalog/common";

import { ContractFieldError } from "./common";

type Reader = Pick<Database, "select">;
type Writer = Pick<Database, "select" | "insert">;

const COUNTER_PREFIX = "HĐ:";

/** The company short name as a code part, or a 409 asking the director. */
export async function companyToken(tx: Reader): Promise<string> {
  const [row] = await tx
    .select({ shortName: companyProfile.shortName })
    .from(companyProfile)
    .where(eq(companyProfile.id, 1));
  const text = row?.shortName?.trim();
  if (!text) throw new ServiceFailure(conflict(CODE_MESSAGES.noCompanyShort));
  try {
    return codeToken(text);
  } catch {
    throw new ServiceFailure(conflict(CODE_MESSAGES.noCompanyShort));
  }
}

/** The customer part: the token of their latest contract, else the code. */
export async function lastCustomerToken(
  tx: Reader,
  customerId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ token: contract.customerToken })
    .from(contract)
    .where(eq(contract.customerId, customerId))
    .orderBy(desc(contract.createdAt))
    .limit(1);
  return row?.token ?? null;
}

/** The token typed on D5a, or the default when left empty. */
export async function customerTokenFor(
  tx: Reader,
  customer: { id: string; code: string },
  typed: string | null | undefined,
): Promise<string> {
  if (typed && typed.trim()) {
    try {
      return codeToken(typed);
    } catch (error: unknown) {
      throw new ContractFieldError((error as Error).message, "customerToken");
    }
  }
  return defaultCustomerToken(
    customer.code,
    await lastCustomerToken(tx, customer.id),
  );
}

function monthOf(startDate: string) {
  return {
    year: Number(startDate.slice(0, 4)),
    month: Number(startDate.slice(5, 7)),
  };
}

/** The base the next number takes: "112026/ANPHAT-MINHPHAT". */
export function codeBaseFor(
  companyShort: string,
  customerToken: string,
  startDate: string,
): string {
  return contractCodeBase({
    ...monthOf(startDate),
    companyShort,
    customerToken,
  });
}

/**
 * Takes the next number of the base in the caller's transaction: the row
 * lock of the upsert makes two callers get two numbers.
 */
export async function issueContractCode(
  tx: Writer,
  companyShort: string,
  customerToken: string,
  startDate: string,
): Promise<string> {
  const { year, month } = monthOf(startDate);
  const [row] = await tx
    .insert(documentCounter)
    .values({
      prefix: `${COUNTER_PREFIX}${companyShort}-${customerToken}`,
      year: year * 100 + month,
      lastNumber: 1,
    })
    .onConflictDoUpdate({
      target: [documentCounter.prefix, documentCounter.year],
      set: { lastNumber: sql`${documentCounter.lastNumber} + 1` },
    })
    .returning({ lastNumber: documentCounter.lastNumber });
  return contractCode(
    codeBaseFor(companyShort, customerToken, startDate),
    row?.lastNumber ?? 1,
  );
}

/**
 * The number D5a shows before the first save: the next one of the base,
 * read without taking it (two drafts may show the same; saving decides).
 */
export async function previewContractCode(
  tx: Reader,
  companyShort: string,
  customerToken: string,
  startDate: string,
): Promise<string> {
  const { year, month } = monthOf(startDate);
  const [row] = await tx
    .select({ lastNumber: documentCounter.lastNumber })
    .from(documentCounter)
    .where(
      sql`${documentCounter.prefix} = ${`${COUNTER_PREFIX}${companyShort}-${customerToken}`} and ${documentCounter.year} = ${year * 100 + month}`,
    );
  return contractCode(
    codeBaseFor(companyShort, customerToken, startDate),
    (row?.lastNumber ?? 0) + 1,
  );
}
