// Posting a site transfer (site-operations design D2, D4): one transaction
// writes the ledger lines, the transfer (with posted_xact first, so the
// trigger lets the moved quantities in), the receiving contract's start and
// one activity row. The office posts a draft, or makes and posts one in a
// go; the phone posts a sent transfer with what the truck carried.
import { eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { contract, siteTransfer, siteTransferLine } from "@/db/schema";
import { toBusinessDate } from "@/domain/business-date";
import { transition as contractTransition } from "@/domain/contract";
import { DomainValueError } from "@/domain/errors";
import type { MovementDraft } from "@/domain/movement";
import { parseQuantity } from "@/domain/quantity";
import { postedTransferSummary } from "@/domain/site-operations-summary";
import {
  allocateTransfer,
  assertMovedQuantities,
  TRANSFER_MESSAGES,
  TRANSFER_PLATE_MAX,
  type MovedLine,
} from "@/domain/site-transfer";
import { can } from "@/domain/permissions";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
  isUniqueViolation,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import {
  ContractFieldError,
  forbidden,
  run,
  type ContractActor,
  type Tx,
} from "@/lib/contracts/common";
import {
  db3,
  isUuid,
  itemFacts,
  onSiteByItemCondition,
  type ItemFacts,
} from "@/lib/deliveries/records";
import { postMovements } from "@/lib/inventory/post";

import {
  readTransferLines,
  SITE_TRANSFER_DOCUMENT_TYPE,
  type TransferRow,
} from "./records";
import {
  assertFresh,
  checkTransfer,
  insertDraft,
  lockPair,
  lockTransferWithPair,
  namedLines,
  nextStatus,
  parseTransfer,
  TRANSFER_SERVICE_MESSAGES,
  type LockedPair,
  type TransferBody,
  type TransferOptions,
} from "./service";

export const POST_TRANSFER_MESSAGES = {
  draftId: "Thiếu mã nháp của điện thoại.",
  draftOfOther: "Mã nháp này đã dùng cho một phiếu khác.",
  line: "Dòng không thuộc phiếu này.",
} as const;

export interface PostedTransfer {
  code: string;
  businessDate: string;
  contractStarted: boolean;
  replayed: boolean;
}

export interface PhonePostBody {
  clientDraftId?: string;
  vehiclePlate?: string | null;
  /** When the phone tapped confirm; information only. */
  confirmedOnDeviceAt?: string | null;
  lines?: { itemId?: string; moved?: string }[];
}

const field = (message: string, name: string) =>
  new ContractFieldError(message, name);

interface PostInput {
  pair: LockedPair;
  row: TransferRow;
  lines: MovedLine[];
  facts: Map<string, ItemFacts>;
  vehiclePlate: string | null;
  clientDraftId: string | null;
  confirmedOnDeviceAt: Date | null;
}

/** Everything after the locks (design D4 steps 5–6). */
async function postLocked(
  tx: Tx,
  actor: ContractActor,
  input: PostInput,
  now: Date,
): Promise<PostedTransfer> {
  const { pair, row } = input;
  const today = toBusinessDate(now);
  assertMovedQuantities(input.lines);
  const moved = input.lines.filter((line) => line.movedMilli > 0);
  const checked = await checkTransfer(
    tx,
    pair,
    {
      lines: moved.map((line) => ({
        itemId: line.itemId,
        itemCode: line.itemCode,
        unit: line.unit,
        milli: line.movedMilli,
      })),
      otherCustomerConfirmed: row.otherCustomerConfirmed,
      overContractConfirmed: row.overContractConfirmed,
    },
    today,
  );
  const onSite = await onSiteByItemCondition(tx, pair.from.id);
  const drafts: MovementDraft[] = [];
  for (const line of checked.lines) {
    const start = drafts.length;
    for (const draft of allocateTransfer({
      code: row.code,
      fromLocationId: row.fromSiteLocationId,
      toLocationId: row.toSiteLocationId,
      itemId: line.itemId,
      milli: line.milli,
      onSite: onSite.get(line.itemId) ?? { NEW: 0, GOOD: 0 },
    })) {
      drafts.push(
        draft.pairedWith === undefined
          ? draft
          : { ...draft, pairedWith: draft.pairedWith + start },
      );
    }
  }
  const posting = await postMovements(
    tx,
    actor,
    {
      documentType: SITE_TRANSFER_DOCUMENT_TYPE,
      documentId: row.id,
      documentCode: row.code,
      businessDate: today,
      lines: drafts,
    },
    today,
  );
  // The parent first: its posted_xact lets this transaction write the lines.
  await tx
    .update(siteTransfer)
    .set({
      status: "POSTED",
      postedXact: sql`pg_current_xact_id()`,
      sameCustomer: checked.sameCustomer,
      businessDate: today,
      postingId: posting.postingId,
      clientDraftId: input.clientDraftId,
      confirmedOnDeviceAt: input.confirmedOnDeviceAt,
      vehiclePlate: input.vehiclePlate,
      postedBy: actor.id,
      postedAt: now,
      updatedAt: now,
    })
    .where(eq(siteTransfer.id, row.id));
  for (const line of input.lines) {
    await tx
      .update(siteTransferLine)
      .set({ movedQuantity: db3(line.movedMilli) })
      .where(
        sql`${siteTransferLine.transferId} = ${row.id} and ${siteTransferLine.itemId} = ${line.itemId}`,
      );
  }
  const contractStarted = pair.to.status === "APPROVED";
  if (contractStarted) {
    const next = contractTransition(
      { status: "APPROVED", hasDeliveries: false },
      "START",
    );
    await tx
      .update(contract)
      .set({ status: next, updatedAt: now })
      .where(eq(contract.id, pair.to.id));
  }
  await logActivity(
    tx,
    actor,
    {
      action: "POST",
      document: {
        type: SITE_TRANSFER_DOCUMENT_TYPE,
        id: row.id,
        code: row.code,
      },
      summary: postedTransferSummary(
        pair.from.siteName,
        pair.to.siteName,
        input.lines.map((line) => ({
          ...namedLines(
            [{ itemId: line.itemId, milli: line.movedMilli }],
            input.facts,
          )[0]!,
          plannedMilli: line.plannedMilli,
        })),
      ),
      anomaly: checked.unusual,
    },
    { now },
  );
  return {
    code: row.code,
    businessDate: today,
    contractStarted,
    replayed: false,
  };
}

async function movedLinesOf(
  tx: Tx,
  row: TransferRow,
  moved: (itemId: string, planned: number) => number = (_, planned) => planned,
): Promise<{ lines: MovedLine[]; facts: Map<string, ItemFacts> }> {
  const stored = await readTransferLines(tx, row.id);
  const facts = await itemFacts(
    tx,
    stored.map((line) => line.itemId),
  );
  return {
    facts,
    lines: stored.map((line) => {
      const info = facts.get(line.itemId) as ItemFacts;
      return {
        itemId: line.itemId,
        itemCode: info.code,
        unit: info.unit,
        plannedMilli: line.plannedMilli,
        movedMilli: moved(line.itemId, line.plannedMilli),
      };
    }),
  };
}

/** "Xác nhận chuyển" on a saved draft (office, design D1 way 1). */
export function postSiteTransfer(
  db: Database,
  actor: ContractActor,
  ref: string,
  body: { updatedAt?: string },
  options: TransferOptions = {},
): Promise<ServiceResult<PostedTransfer>> {
  return run(async () => {
    const now = options.now ?? new Date();
    const posted = await db.transaction(async (tx) => {
      const locked = await lockTransferWithPair(tx, actor, ref);
      await nextStatus(tx, locked.row, "POST");
      assertFresh(locked.row, body.updatedAt);
      const { lines, facts } = await movedLinesOf(tx, locked.row);
      return postLocked(
        tx,
        actor,
        {
          pair: locked,
          row: locked.row,
          lines,
          facts,
          vehiclePlate: locked.row.vehiclePlate,
          clientDraftId: null,
          confirmedOnDeviceAt: null,
        },
        now,
      );
    });
    return ok(posted);
  });
}

/**
 * "Xác nhận chuyển" before saving: makes the draft and posts it in one
 * transaction, logging only the posting (spec site-transfers).
 */
export function createAndPostSiteTransfer(
  db: Database,
  actor: ContractActor,
  body: TransferBody,
  options: TransferOptions = {},
): Promise<ServiceResult<PostedTransfer>> {
  return run(async () => {
    if (!isUuid(body.fromContractId)) {
      throw field(TRANSFER_SERVICE_MESSAGES.chooseFrom, "fromContractId");
    }
    if (!isUuid(body.toContractId)) {
      throw field(TRANSFER_SERVICE_MESSAGES.chooseTo, "toContractId");
    }
    const { fromContractId, toContractId } = body;
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    const posted = await db.transaction(async (tx) => {
      const pair = await lockPair(tx, actor, fromContractId, toContractId);
      const parsed = await parseTransfer(tx, body);
      const checked = await checkTransfer(tx, pair, parsed, today);
      const row = await insertDraft(
        tx,
        actor,
        pair,
        parsed,
        checked,
        today,
        now,
      );
      const { lines, facts } = await movedLinesOf(tx, row);
      return postLocked(
        tx,
        actor,
        {
          pair,
          row,
          lines,
          facts,
          vehiclePlate: row.vehiclePlate,
          clientDraftId: null,
          confirmedOnDeviceAt: null,
        },
        now,
      );
    });
    return ok(posted);
  });
}

async function replayOf(
  tx: Pick<Database, "select">,
  actor: ContractActor,
  draftId: string,
): Promise<PostedTransfer | null> {
  const [row] = await tx
    .select({
      code: siteTransfer.code,
      businessDate: siteTransfer.businessDate,
      postedBy: siteTransfer.postedBy,
    })
    .from(siteTransfer)
    .where(eq(siteTransfer.clientDraftId, draftId));
  if (!row) return null;
  if (row.postedBy !== actor.id) {
    throw new ServiceFailure(conflict(POST_TRANSFER_MESSAGES.draftOfOther));
  }
  return {
    code: row.code,
    businessDate: row.businessDate ?? "",
    contractStarted: false,
    replayed: true,
  };
}

function readMoved(
  body: PhonePostBody,
  lines: readonly { itemId: string }[],
  facts: Map<string, ItemFacts>,
): Map<string, number> {
  const moved = new Map<string, number>();
  (body.lines ?? []).forEach((line, index) => {
    const info = line.itemId ? facts.get(line.itemId) : undefined;
    if (!info || !lines.some((stored) => stored.itemId === info.id)) {
      throw field(POST_TRANSFER_MESSAGES.line, `lines.${index}.itemId`);
    }
    try {
      const text = line.moved?.trim() ?? "";
      moved.set(
        info.id,
        text === "" ? 0 : parseQuantity(text, info.unit).milli,
      );
    } catch (error: unknown) {
      if (error instanceof DomainValueError) {
        throw field(error.message, `lines.${index}.moved`);
      }
      throw error;
    }
  });
  return moved;
}

function readDeviceTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** M9 "Xác nhận đã chuyển tới …" (design D1 way 2). */
export function postSiteTransferFromPhone(
  db: Database,
  actor: ContractActor,
  ref: string,
  body: PhonePostBody,
  options: TransferOptions = {},
): Promise<ServiceResult<PostedTransfer>> {
  return run(async () => {
    if (!can(actor.role, "deliveries.pick")) {
      throw new ServiceFailure(forbidden());
    }
    if (!isUuid(body.clientDraftId)) {
      throw field(POST_TRANSFER_MESSAGES.draftId, "clientDraftId");
    }
    const draftId = body.clientDraftId;
    const replay = await replayOf(db, actor, draftId);
    if (replay) return ok(replay);
    const plate = (body.vehiclePlate ?? "").trim();
    if (plate.length > TRANSFER_PLATE_MAX) {
      throw field(TRANSFER_MESSAGES.plateLong, "vehiclePlate");
    }
    const now = options.now ?? new Date();
    try {
      const posted = await db.transaction(async (tx) => {
        // The storekeeper confirms with deliveries.pick, checked above.
        const locked = await lockTransferWithPair(tx, null, ref);
        if (
          locked.row.status === "POSTED" &&
          locked.row.clientDraftId === draftId &&
          locked.row.postedBy === actor.id
        ) {
          return {
            code: locked.row.code,
            businessDate: locked.row.businessDate ?? "",
            contractStarted: false,
            replayed: true,
          };
        }
        await nextStatus(tx, locked.row, "POST", true);
        const stored = await readTransferLines(tx, locked.row.id);
        const facts = await itemFacts(
          tx,
          stored.map((line) => line.itemId),
        );
        const moved = readMoved(body, stored, facts);
        const { lines } = await movedLinesOf(
          tx,
          locked.row,
          (itemId, planned) => moved.get(itemId) ?? planned,
        );
        return postLocked(
          tx,
          actor,
          {
            pair: locked,
            row: locked.row,
            lines,
            facts,
            vehiclePlate: plate === "" ? locked.row.vehiclePlate : plate,
            clientDraftId: draftId,
            confirmedOnDeviceAt: readDeviceTime(body.confirmedOnDeviceAt),
          },
          now,
        );
      });
      return ok(posted);
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      const again = await replayOf(db, actor, draftId);
      if (!again) throw error;
      return ok(again);
    }
  });
}
