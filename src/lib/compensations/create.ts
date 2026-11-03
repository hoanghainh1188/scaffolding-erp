// The compensation note made with a posted return note (returns-and-
// compensation design D3, D7 step 8): lines priced from the contract revision
// in force on the return date. Called inside postReturn's transaction.
import { compensationNote, compensationNoteLine } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import {
  COMPENSATION_PREFIX,
  compensationLines,
  compensationTotal,
  type CompensationSourceLine,
} from "@/domain/compensation";
import { DomainValueError } from "@/domain/errors";
import { createdCompensationSummary } from "@/domain/return-summary";
import { logActivity } from "@/lib/activity/log";
import type { ContractActor, Tx } from "@/lib/contracts/common";
import { contractTermsAt } from "@/lib/contracts/terms";
import { db3 } from "@/lib/deliveries/records";
import { nextDocumentCode } from "@/lib/inventory/counter";

export const COMPENSATION_DOCUMENT_TYPE = "COMPENSATION_NOTE";

export interface CreatedCompensation {
  id: string;
  code: string;
}

/** Null when the return has nothing damaged, scrapped or lost. */
export async function createCompensation(
  tx: Tx,
  actor: ContractActor,
  input: {
    contractId: string;
    returnNoteId: string;
    returnCode: string;
    returnDate: BusinessDate;
    lines: readonly CompensationSourceLine[];
    itemCodes: ReadonlyMap<string, string>;
  },
  now: Date,
): Promise<CreatedCompensation | null> {
  const terms = await contractTermsAt(tx, input.contractId, input.returnDate);
  if (!terms) {
    throw new DomainValueError(
      "Hợp đồng chưa có bản đã duyệt tại ngày trả nên chưa tính được đền bù.",
    );
  }
  const drafts = compensationLines(input.lines, terms.compensations);
  if (drafts.length === 0) return null;
  const code = await nextDocumentCode(
    tx,
    COMPENSATION_PREFIX,
    Number(input.returnDate.slice(0, 4)),
  );
  const [row] = await tx
    .insert(compensationNote)
    .values({
      code,
      returnNoteId: input.returnNoteId,
      contractId: input.contractId,
      revisionId: terms.revisionId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: compensationNote.id });
  const id = row?.id ?? "";
  await tx.insert(compensationNoteLine).values(
    drafts.map((line) => ({
      noteId: id,
      itemId: line.itemId,
      kind: line.kind,
      quantity: db3(line.quantityMilli),
      unitPrice: line.unitPrice,
      contractPrice: line.contractPrice,
    })),
  );
  const total = compensationTotal(
    drafts.map((line) => ({
      itemCode: input.itemCodes.get(line.itemId) ?? "",
      kind: line.kind,
      quantityMilli: line.quantityMilli,
      unitPrice: line.unitPrice,
    })),
  );
  await logActivity(
    tx,
    actor,
    {
      action: "CREATE",
      document: { type: COMPENSATION_DOCUMENT_TYPE, id, code },
      summary: createdCompensationSummary(
        input.returnCode,
        total,
        drafts.length,
      ),
    },
    { now },
  );
  return { id, code };
}
