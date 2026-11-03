// On-site exchanges (site-operations design D6; 0.2 #68, #72): D6d makes a
// delivery batch of the new items and a waiting link with the old items
// expected back; M4 joins the return note to that link. No document of its
// own: the activity rows belong to the delivery note.
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  deliveryExchange,
  deliveryExchangeLine,
  deliveryNote,
} from "@/db/schema";
import {
  assertExpectedLines,
  cancelReason,
  EXCHANGE_MESSAGES,
  type ExchangeStatus,
  type ExpectedLine,
} from "@/domain/exchange";
import { DomainValueError } from "@/domain/errors";
import { parseQuantity } from "@/domain/quantity";
import { exchangeSummary } from "@/domain/site-operations-summary";
import { logActivity } from "@/lib/activity/log";
import {
  notFound,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import {
  assertContractAccess,
  ContractFieldError,
  run,
  type ContractActor,
} from "@/lib/contracts/common";
import { lockContract } from "@/lib/contracts/records";
import {
  db3,
  DELIVERY_DOCUMENT_TYPE,
  isUuid,
  itemFacts,
  onSiteByItemCondition,
  type ItemFacts,
} from "@/lib/deliveries/records";
import { insertDelivery, type DeliveryBody } from "@/lib/deliveries/service";

import { type ExchangeRow } from "./records";

export interface ExchangeBody extends DeliveryBody {
  /** The old items expected back (only a hint for M4). */
  expected?: { itemId?: string; quantity?: string }[];
}

export interface SavedExchange {
  id: string;
  deliveryNoteId: string;
  deliveryCode: string;
  batchNo: number;
}

export interface ExchangeOptions {
  now?: Date;
}

const field = (message: string, name: string) =>
  new ContractFieldError(message, name);

function readExpected(
  body: ExchangeBody,
  facts: ReadonlyMap<string, ItemFacts>,
): ExpectedLine[] {
  return (body.expected ?? []).map((line, index) => {
    const info = line.itemId ? facts.get(line.itemId) : undefined;
    if (!info) throw field("Bạn chọn mã hàng.", `expected.${index}.itemId`);
    try {
      return {
        itemId: info.id,
        itemCode: info.code,
        unit: info.unit,
        milli: parseQuantity(line.quantity ?? "", info.unit).milli,
      };
    } catch (error: unknown) {
      if (error instanceof DomainValueError) {
        throw field(error.message, `expected.${index}.quantity`);
      }
      throw error;
    }
  });
}

const named = (
  rows: readonly { itemId: string; milli: number }[],
  facts: ReadonlyMap<string, ItemFacts>,
) =>
  rows.map((row) => {
    const info = facts.get(row.itemId) as ItemFacts;
    return {
      itemCode: info.code,
      itemName: info.name,
      unit: info.unit,
      milli: row.milli,
    };
  });

/** "Tạo đợt xuất + chờ thu hồi" on D6d (spec site-exchanges). */
export function createExchange(
  db: Database,
  actor: ContractActor,
  body: ExchangeBody,
  options: ExchangeOptions = {},
): Promise<ServiceResult<SavedExchange>> {
  return run(async () => {
    if (!isUuid(body.contractId)) {
      throw field("Bạn mở đổi hàng từ hợp đồng thuê.", "contractId");
    }
    const contractId = body.contractId;
    const now = options.now ?? new Date();
    const saved = await db.transaction(async (tx) => {
      const contract = await lockContract(tx, contractId);
      assertContractAccess(actor, contract.type, "manage");
      if (contract.type !== "RENTAL" || contract.status !== "ACTIVE") {
        throw new DomainValueError(EXCHANGE_MESSAGES.notActive);
      }
      const expectedIds = (body.expected ?? [])
        .map((line) => line.itemId)
        .filter((id): id is string => isUuid(id));
      const expectedFacts = await itemFacts(tx, expectedIds);
      const expected = assertExpectedLines(
        contract.code,
        readExpected(body, expectedFacts),
        await onSiteByItemCondition(tx, contract.id),
      );
      const made = await insertDelivery(tx, actor, contract, body, now);
      const [row] = await tx
        .insert(deliveryExchange)
        .values({
          contractId: contract.id,
          deliveryNoteId: made.note.id,
          createdBy: actor.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const exchange = row as ExchangeRow;
      await tx.insert(deliveryExchangeLine).values(
        expected.map((line, index) => ({
          exchangeId: exchange.id,
          lineNo: index + 1,
          itemId: line.itemId,
          expectedQuantity: db3(line.milli),
        })),
      );
      const givenFacts = await itemFacts(
        tx,
        made.lines.map((line) => line.itemId),
      );
      await logActivity(
        tx,
        actor,
        {
          action: "CREATE",
          document: {
            type: DELIVERY_DOCUMENT_TYPE,
            id: made.note.id,
            code: made.note.code,
          },
          summary: exchangeSummary(
            made.batchNo,
            named(
              made.lines.map((line) => ({
                itemId: line.itemId,
                milli: line.requestedMilli,
              })),
              givenFacts,
            ),
            named(expected, expectedFacts),
          ),
          anomaly: made.over.length > 0,
        },
        { now },
      );
      return {
        id: exchange.id,
        deliveryNoteId: made.note.id,
        deliveryCode: made.note.code,
        batchNo: made.batchNo,
      };
    });
    return ok(saved);
  });
}

/** "Bỏ chờ thu hồi": the customer keeps the old items (0.2 #72). */
export function cancelExchange(
  db: Database,
  actor: ContractActor,
  id: string,
  reason: string | null | undefined,
  options: ExchangeOptions = {},
): Promise<ServiceResult<{ id: string; status: ExchangeStatus }>> {
  return run(async () => {
    if (!isUuid(id)) throw new ServiceFailure(notFound());
    const now = options.now ?? new Date();
    const saved = await db.transaction(async (tx) => {
      const [found] = await tx
        .select({ contractId: deliveryExchange.contractId })
        .from(deliveryExchange)
        .where(eq(deliveryExchange.id, id));
      if (!found) throw new ServiceFailure(notFound());
      const contract = await lockContract(tx, found.contractId);
      assertContractAccess(actor, contract.type, "manage");
      const [row] = await tx
        .select()
        .from(deliveryExchange)
        .where(eq(deliveryExchange.id, id))
        .for("update");
      if (!row) throw new ServiceFailure(notFound());
      const text = cancelReason(row.status as ExchangeStatus, reason);
      await tx
        .update(deliveryExchange)
        .set({ status: "CANCELLED", cancelledReason: text, updatedAt: now })
        .where(eq(deliveryExchange.id, id));
      const [note] = await tx
        .select({ id: deliveryNote.id, code: deliveryNote.code })
        .from(deliveryNote)
        .where(eq(deliveryNote.id, row.deliveryNoteId));
      await logActivity(
        tx,
        actor,
        {
          action: "UPDATE",
          document: {
            type: DELIVERY_DOCUMENT_TYPE,
            id: note?.id ?? row.deliveryNoteId,
            code: note?.code ?? "",
          },
          summary: `Bỏ chờ thu hồi: ${text}`,
        },
        { now },
      );
      return { id, status: "CANCELLED" as const };
    });
    return ok(saved);
  });
}
