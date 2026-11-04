// "Chốt kỳ và ghi công nợ" (0.2 #22, #78; rental-billing design D4, D6):
// in one transaction, after locking the contract (the order of every
// contract command) and taking the holiday lock shared, the statement is
// computed again, compared with what the user saw, and copied whole into
// billing_period, its lines and its freight; the adjustments of the month
// freeze with it. receivables reads the amounts and the due date from here.
import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  billingAdjustment,
  billingPeriod,
  billingPeriodFreight,
  billingPeriodLine,
} from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { formatMoney, toMoney } from "@/domain/money";
import { can } from "@/domain/permissions";
import {
  formatMonth,
  periodOf,
  rateText,
  termsOn,
  type Statement,
  type StatementLine,
} from "@/domain/rental-billing";
import type { ActivityActor } from "@/lib/activity/actor";
import { logActivity, type Tx } from "@/lib/activity/log";
import {
  conflict,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import { ContractFieldError, forbidden, run } from "@/lib/contracts/common";
import { lockContract } from "@/lib/contracts/records";
import { db3 } from "@/lib/deliveries/records";
import { readHolidays } from "@/lib/holidays/queries";
import { HOLIDAY_LOCK } from "@/lib/holidays/service";

import {
  CLOSE_MESSAGES,
  loadBillingSource,
  statementOf,
  whyNotClosable,
} from "./compute";
import { minimumNote } from "./queries";

export interface CloseBody {
  /** The amount due the user saw on D7. */
  expectedTotal?: number;
}

export interface ClosedPeriod {
  id: string;
  month: string;
  totalAmount: number;
  dueDate: string;
  lineCount: number;
}

export interface CloseOptions {
  now?: Date;
}

function lineRow(periodId: string, line: StatementLine, index: number) {
  const note =
    line.kind === "MINIMUM"
      ? minimumNote(line.minimumDays ?? 0)
      : (line.adjustment?.reason ?? null);
  return {
    periodId,
    lineNo: index + 1,
    kind: line.kind,
    itemId: line.itemId,
    itemCode: line.itemCode,
    itemName: line.itemName,
    quantity: line.kind === "ADJUSTMENT" ? null : db3(line.quantityMilli),
    fromDate: line.fromDate,
    toDate: line.toDate,
    calendarDays: line.calendarDays,
    holidayDays: line.holidayDays,
    chargedDays: line.chargedDays,
    dailyPrice: line.dailyPrice,
    amount: line.amount,
    vatRate: rateText(line.vatBasisPoints),
    revisionCode: line.revisionCode,
    priceChanged: line.priceChanged,
    inDocumentType: line.inDoc?.type ?? null,
    inDocumentCode: line.inDoc?.code ?? null,
    inDate: line.inDate,
    originDate: line.originDate,
    outKind: line.out?.kind ?? null,
    outDocumentType: line.out?.doc.type ?? null,
    outDocumentCode: line.out?.doc.code ?? null,
    outDate: line.out?.date ?? null,
    adjustmentId: line.adjustment?.id ?? null,
    refMonth: line.adjustment ? `${line.adjustment.refMonth}-01` : null,
    note,
  };
}

async function writePeriod(
  tx: Tx,
  actor: ActivityActor,
  contractId: string,
  revisionId: string,
  statement: Statement,
  now: Date,
): Promise<string> {
  const { period } = statement;
  const [row] = await tx
    .insert(billingPeriod)
    .values({
      contractId,
      month: period.from,
      periodEnd: period.to,
      revisionId,
      rentAmount: statement.rentAmount,
      adjustmentAmount: statement.adjustmentAmount,
      freightAmount: statement.freightAmount,
      vatAmount: statement.vatAmount,
      totalAmount: statement.totalAmount,
      paymentTermsDays: statement.paymentTermsDays,
      dueDate: statement.dueDate,
      holidayDays: statement.holidayDays,
      lineCount: statement.lines.length,
      closedBy: actor.id,
      closedAt: now,
    })
    .returning({ id: billingPeriod.id });
  if (!row) throw new Error("billing period insert returned nothing");
  if (statement.lines.length > 0) {
    await tx
      .insert(billingPeriodLine)
      .values(
        statement.lines.map((line, index) => lineRow(row.id, line, index)),
      );
  }
  if (statement.freight.length > 0) {
    await tx.insert(billingPeriodFreight).values(
      statement.freight.map((entry) => ({
        periodId: row.id,
        deliveryNoteId: entry.deliveryNoteId,
        deliveryCode: entry.code,
        batchNo: entry.batchNo,
        vehiclePlate: entry.vehiclePlate,
        businessDate: entry.date,
        amount: entry.amount,
        vatRate: rateText(entry.vatBasisPoints),
      })),
    );
  }
  await tx
    .update(billingAdjustment)
    .set({ closedPeriodId: row.id })
    .where(
      and(
        eq(billingAdjustment.contractId, contractId),
        eq(billingAdjustment.month, period.from),
      ),
    );
  return row.id;
}

/** Closes one month of one rental contract. */
export function closeBillingPeriod(
  db: Database,
  actor: ActivityActor,
  contractId: string,
  month: string,
  body: CloseBody,
  options: CloseOptions = {},
): Promise<ServiceResult<ClosedPeriod>> {
  return run(async () => {
    if (!can(actor.role, "billing.manage"))
      throw new ServiceFailure(forbidden());
    let period;
    try {
      period = periodOf(month);
    } catch (error: unknown) {
      if (error instanceof Error)
        throw new ContractFieldError(error.message, "month");
      throw error;
    }
    const now = options.now ?? new Date();
    const today: BusinessDate = toBusinessDate(now);
    return db.transaction(async (tx) => {
      const locked = await lockContract(tx, contractId);
      if (locked.type !== "RENTAL") {
        throw new ServiceFailure(conflict(CLOSE_MESSAGES.empty(period.month)));
      }
      await tx.execute(
        sql`select pg_advisory_xact_lock_shared(hashtext(${HOLIDAY_LOCK}))`,
      );
      const holidays = await readHolidays(tx);
      const source = await loadBillingSource(tx, locked.id);
      if (source.terms.length === 0) {
        throw new ServiceFailure(conflict(CLOSE_MESSAGES.noTerms));
      }
      const statement = statementOf(source, period.month, today, holidays);
      const refusal = whyNotClosable(source, statement, today, holidays);
      if (refusal) throw new ServiceFailure(conflict(refusal));
      if (body.expectedTotal !== statement.totalAmount) {
        throw new ServiceFailure(
          conflict(
            CLOSE_MESSAGES.changed(
              formatMoney(toMoney(body.expectedTotal ?? 0)),
              formatMoney(statement.totalAmount),
            ),
          ),
        );
      }
      const revision = termsOn(source.terms, period.to);
      const id = await writePeriod(
        tx,
        actor,
        locked.id,
        revision.id ?? "",
        statement,
        now,
      );
      await logActivity(
        tx,
        actor,
        {
          action: "CLOSE_PERIOD",
          document: {
            type: "BILLING_PERIOD",
            id,
            code: `${locked.code} · ${formatMonth(period.month)}`,
          },
          summary: `${locked.code} · kỳ ${formatMonth(period.month)} · ${statement.lines.length} dòng · phải thu ${formatMoney(statement.totalAmount)}`,
        },
        { now },
      );
      return ok({
        id,
        month: period.month,
        totalAmount: statement.totalAmount,
        dueDate: statement.dueDate,
        lineCount: statement.lines.length,
      });
    });
  });
}
