// Site transfers from D6b (site-operations design D1, D3, D4): make, edit,
// send to the phone, pull back and cancel. Every command locks the two
// contracts in ascending id order, then the transfer, re-reads the pair it
// locked and logs one activity row in the same transaction.
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { siteTransfer, siteTransferLine, user } from "@/db/schema";
import { diffFields, type FieldSpec } from "@/domain/activity-changes";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { amountsText, type NamedAmount } from "@/domain/delivery-summary";
import { DomainValueError } from "@/domain/errors";
import { parseQuantity } from "@/domain/quantity";
import { plannedTransferSummary } from "@/domain/site-operations-summary";
import {
  assertTransferLines,
  requireTransferReason,
  SITE_TRANSFER_PREFIX,
  transition,
  TRANSFER_MESSAGES,
  TRANSFER_NOTE_MAX,
  TRANSFER_PLATE_MAX,
  type TransferCheckResult,
  type TransferCommand,
  type TransferLineInput,
  type TransferStatus,
} from "@/domain/site-transfer";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
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
  type Tx,
} from "@/lib/contracts/common";
import { lockContractsInOrder } from "@/lib/contracts/records";
import {
  db3,
  isUuid,
  itemFacts,
  type ItemFacts,
} from "@/lib/deliveries/records";
import { nextDocumentCode } from "@/lib/inventory/counter";

import {
  contractPlace,
  findTransfer,
  lockTransfer,
  readTransferLines,
  SITE_TRANSFER_DOCUMENT_TYPE,
  transferContext,
  type TransferPlace,
  type TransferRow,
} from "./records";

export const TRANSFER_SERVICE_MESSAGES = {
  stale: "Phiếu vừa được người khác sửa. Bạn tải lại để xem bản mới.",
  chooseFrom: "Bạn mở phiếu chuyển từ hợp đồng đi.",
  chooseTo: "Bạn chọn công trình nhận.",
  item: "Bạn chọn mã hàng.",
  postedBy: (code: string, time: string, name: string) =>
    `Phiếu ${code} đã chuyển lúc ${time} do ${name} xác nhận.`,
} as const;

export interface TransferBody {
  fromContractId?: string;
  toContractId?: string;
  lines?: { itemId?: string; quantity?: string }[];
  vehiclePlate?: string | null;
  note?: string | null;
  otherCustomerConfirmed?: boolean;
  overContractConfirmed?: boolean;
  /** Edits and office posting: when the transfer was last saved. */
  updatedAt?: string;
}

export interface SavedTransfer {
  id: string;
  code: string;
  status: TransferStatus;
  updatedAt: string;
}

export interface TransferOptions {
  now?: Date;
}

const field = (message: string, name: string) =>
  new ContractFieldError(message, name);

export const savedTransferOf = (row: TransferRow): SavedTransfer => ({
  id: row.id,
  code: row.code,
  status: row.status as TransferStatus,
  updatedAt: row.updatedAt.toISOString(),
});

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "Phiếu CCT-2026-004 đã chuyển lúc 16:05 do Văn Tùng xác nhận." */
export async function postedByText(tx: Tx, row: TransferRow): Promise<string> {
  const [who] = row.postedBy
    ? await tx
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, row.postedBy))
    : [];
  return TRANSFER_SERVICE_MESSAGES.postedBy(
    row.code,
    row.postedAt ? timeFormatter.format(row.postedAt) : "",
    who?.name ?? "",
  );
}

function optionalText(
  value: string | null | undefined,
  max: number,
  message: string,
  name: string,
): string | null {
  const text = value?.trim() ?? "";
  if (text === "") return null;
  if (text.length > max) throw field(message, name);
  return text;
}

export interface ParsedTransfer {
  lines: TransferLineInput[];
  facts: Map<string, ItemFacts>;
  vehiclePlate: string | null;
  note: string | null;
  otherCustomerConfirmed: boolean;
  overContractConfirmed: boolean;
}

/** The body as numbers; rules are checked by assertTransferLines. */
export async function parseTransfer(
  tx: Tx,
  body: TransferBody,
): Promise<ParsedTransfer> {
  const raw = body.lines ?? [];
  const facts = await itemFacts(
    tx,
    raw.map((line) => line.itemId).filter((id): id is string => isUuid(id)),
  );
  const lines = raw.map((line, index): TransferLineInput => {
    const info = line.itemId ? facts.get(line.itemId) : undefined;
    if (!info) {
      throw field(TRANSFER_SERVICE_MESSAGES.item, `lines.${index}.itemId`);
    }
    try {
      const text = line.quantity?.trim() ?? "";
      const milli = text === "" ? 0 : parseQuantity(text, info.unit).milli;
      return { itemId: info.id, itemCode: info.code, unit: info.unit, milli };
    } catch (error: unknown) {
      if (error instanceof DomainValueError) {
        throw field(error.message, `lines.${index}.quantity`);
      }
      throw error;
    }
  });
  return {
    lines,
    facts,
    vehiclePlate: optionalText(
      body.vehiclePlate,
      TRANSFER_PLATE_MAX,
      TRANSFER_MESSAGES.plateLong,
      "vehiclePlate",
    ),
    note: optionalText(
      body.note,
      TRANSFER_NOTE_MAX,
      TRANSFER_MESSAGES.noteLong,
      "note",
    ),
    otherCustomerConfirmed: body.otherCustomerConfirmed === true,
    overContractConfirmed: body.overContractConfirmed === true,
  };
}

export interface LockedPair {
  from: TransferPlace;
  to: TransferPlace;
}

/**
 * Locks every contract a command touches (ascending id), then reads the
 * pair. `extra` holds the old receiving contract of an edit. A null actor
 * skips the contract access check: the phone confirms with deliveries.pick.
 */
export async function lockPair(
  tx: Tx,
  actor: ContractActor | null,
  fromId: string,
  toId: string,
  extra: readonly string[] = [],
): Promise<LockedPair> {
  await lockContractsInOrder(tx, [fromId, toId, ...extra]);
  const [from, to] = await Promise.all([
    contractPlace(tx, fromId),
    contractPlace(tx, toId),
  ]);
  if (!from) throw new ServiceFailure(notFound());
  if (!to) throw field(TRANSFER_SERVICE_MESSAGES.chooseTo, "toContractId");
  if (actor) {
    assertContractAccess(actor, from.type, "manage");
    assertContractAccess(actor, to.type, "manage");
  }
  return { from, to };
}

/** Rules of a transfer against today's stock and terms (design D3). */
export async function checkTransfer(
  tx: Tx,
  pair: LockedPair,
  parsed: Pick<
    ParsedTransfer,
    "lines" | "otherCustomerConfirmed" | "overContractConfirmed"
  >,
  today: BusinessDate,
): Promise<TransferCheckResult> {
  const context = await transferContext(tx, pair.from.id, pair.to.id, today);
  return assertTransferLines({
    from: pair.from,
    to: pair.to,
    lines: parsed.lines,
    onSite: context.onSite,
    onTarget: context.onTarget,
    remaining: context.remaining,
    otherCustomerConfirmed: parsed.otherCustomerConfirmed,
    overContractConfirmed: parsed.overContractConfirmed,
  });
}

export const namedLines = (
  lines: readonly { itemId: string; milli: number }[],
  facts: ReadonlyMap<string, ItemFacts>,
): NamedAmount[] =>
  lines.map((line) => {
    const info = facts.get(line.itemId) as ItemFacts;
    return {
      itemCode: info.code,
      itemName: info.name,
      unit: info.unit,
      milli: line.milli,
    };
  });

/** Writes a new draft and its lines; no activity row (the caller logs). */
export async function insertDraft(
  tx: Tx,
  actor: ContractActor,
  pair: LockedPair,
  parsed: ParsedTransfer,
  checked: TransferCheckResult,
  today: BusinessDate,
  now: Date,
): Promise<TransferRow> {
  if (!pair.from.siteLocationId || !pair.to.siteLocationId) {
    throw new DomainValueError(TRANSFER_MESSAGES.toNotRental);
  }
  const code = await nextDocumentCode(
    tx,
    SITE_TRANSFER_PREFIX,
    Number(today.slice(0, 4)),
  );
  const [row] = await tx
    .insert(siteTransfer)
    .values({
      code,
      fromContractId: pair.from.id,
      toContractId: pair.to.id,
      fromSiteLocationId: pair.from.siteLocationId,
      toSiteLocationId: pair.to.siteLocationId,
      vehiclePlate: parsed.vehiclePlate,
      note: parsed.note,
      otherCustomerConfirmed: !checked.sameCustomer,
      overContractConfirmed: parsed.overContractConfirmed,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const transfer = row as TransferRow;
  await writeLines(tx, transfer.id, checked.lines);
  return transfer;
}

async function writeLines(
  tx: Tx,
  transferId: string,
  lines: readonly TransferLineInput[],
): Promise<void> {
  await tx.insert(siteTransferLine).values(
    lines.map((line, index) => ({
      transferId,
      lineNo: index + 1,
      itemId: line.itemId,
      plannedQuantity: db3(line.milli),
    })),
  );
}

/** "Lưu nháp" on D6b (spec site-transfers "Phiếu chuyển giữa hai hợp đồng thuê"). */
export function createSiteTransfer(
  db: Database,
  actor: ContractActor,
  body: TransferBody,
  options: TransferOptions = {},
): Promise<ServiceResult<SavedTransfer>> {
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
    const saved = await db.transaction(async (tx) => {
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
      await logActivity(
        tx,
        actor,
        {
          action: "CREATE",
          document: {
            type: SITE_TRANSFER_DOCUMENT_TYPE,
            id: row.id,
            code: row.code,
          },
          summary: plannedTransferSummary(
            pair.from.siteName,
            pair.to.siteName,
            namedLines(checked.lines, parsed.facts),
          ),
          anomaly: checked.unusual,
        },
        { now },
      );
      return savedTransferOf(row);
    });
    return ok(saved);
  });
}

/**
 * Locks the contracts of a transfer and the transfer (design D4): reads it
 * without a lock, locks the pair (plus `extra`), locks the transfer and
 * answers 409 when its pair changed in between.
 */
export async function lockTransferWithPair(
  tx: Tx,
  actor: ContractActor | null,
  ref: string,
  extra: (row: TransferRow) => readonly string[] = () => [],
): Promise<LockedPair & { row: TransferRow }> {
  const found = await findTransfer(tx, ref);
  if (!found) throw new ServiceFailure(notFound());
  const pair = await lockPair(
    tx,
    actor,
    found.fromContractId,
    found.toContractId,
    extra(found),
  );
  const row = await lockTransfer(tx, found.id);
  if (
    row.fromContractId !== found.fromContractId ||
    row.toContractId !== found.toContractId
  ) {
    throw new ServiceFailure(conflict(TRANSFER_SERVICE_MESSAGES.stale));
  }
  return { ...pair, row };
}

export function assertFresh(row: TransferRow, updatedAt: string | undefined) {
  if (!updatedAt || new Date(updatedAt).getTime() !== row.updatedAt.getTime()) {
    throw new ServiceFailure(conflict(TRANSFER_SERVICE_MESSAGES.stale));
  }
}

/** The status a command leads to; a posted transfer names who posted it. */
export async function nextStatus(
  tx: Tx,
  row: TransferRow,
  command: TransferCommand,
  byPhone = false,
): Promise<TransferStatus> {
  if (row.status === "POSTED") {
    throw new ServiceFailure(conflict(await postedByText(tx, row)));
  }
  return transition(row.status as TransferStatus, command, row.code, byPhone);
}

interface Shown {
  to: string;
  goods: string;
  plate: string | null;
  note: string | null;
}

const SHOWN_FIELDS: readonly FieldSpec<Shown>[] = [
  { field: "toContractId", label: "Công trình nhận", value: (row) => row.to },
  { field: "lines", label: "Hàng", value: (row) => row.goods },
  { field: "vehiclePlate", label: "Biển số", value: (row) => row.plate },
  { field: "note", label: "Ghi chú", value: (row) => row.note },
];

/** "Lưu" on a draft: may change the receiving contract (design D4). */
export function updateSiteTransfer(
  db: Database,
  actor: ContractActor,
  ref: string,
  body: TransferBody,
  options: TransferOptions = {},
): Promise<ServiceResult<SavedTransfer>> {
  return run(async () => {
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    const saved = await db.transaction(async (tx) => {
      const found = await findTransfer(tx, ref);
      if (!found) throw new ServiceFailure(notFound());
      const toId = isUuid(body.toContractId)
        ? body.toContractId
        : found.toContractId;
      // The new receiving contract is locked with the old one and the source.
      const pair = await lockPair(tx, actor, found.fromContractId, toId, [
        found.toContractId,
      ]);
      const row = await lockTransfer(tx, found.id);
      if (
        row.fromContractId !== found.fromContractId ||
        row.toContractId !== found.toContractId
      ) {
        throw new ServiceFailure(conflict(TRANSFER_SERVICE_MESSAGES.stale));
      }
      await nextStatus(tx, row, "EDIT");
      assertFresh(row, body.updatedAt);
      const parsed = await parseTransfer(tx, body);
      const checked = await checkTransfer(tx, pair, parsed, today);
      const before = await readTransferLines(tx, row.id);
      const beforeFacts = await itemFacts(
        tx,
        before.map((line) => line.itemId),
      );
      const oldTo = await contractPlace(tx, row.toContractId);
      const changes = diffFields(
        SHOWN_FIELDS,
        {
          to: oldTo?.siteName ?? "",
          goods: amountsText(
            namedLines(
              before.map((line) => ({
                itemId: line.itemId,
                milli: line.plannedMilli,
              })),
              beforeFacts,
            ),
          ),
          plate: row.vehiclePlate,
          note: row.note,
        },
        {
          to: pair.to.siteName,
          goods: amountsText(namedLines(checked.lines, parsed.facts)),
          plate: parsed.vehiclePlate,
          note: parsed.note,
        },
      );
      const flags =
        row.overContractConfirmed !== parsed.overContractConfirmed ||
        row.otherCustomerConfirmed !== !checked.sameCustomer;
      if (changes.length === 0 && !flags) return savedTransferOf(row);
      await tx
        .delete(siteTransferLine)
        .where(eq(siteTransferLine.transferId, row.id));
      await writeLines(tx, row.id, checked.lines);
      if (!pair.to.siteLocationId) {
        throw new DomainValueError(TRANSFER_MESSAGES.toNotRental);
      }
      const [updated] = await tx
        .update(siteTransfer)
        .set({
          toContractId: pair.to.id,
          toSiteLocationId: pair.to.siteLocationId,
          vehiclePlate: parsed.vehiclePlate,
          note: parsed.note,
          otherCustomerConfirmed: !checked.sameCustomer,
          overContractConfirmed: parsed.overContractConfirmed,
          updatedAt: now,
        })
        .where(eq(siteTransfer.id, row.id))
        .returning();
      if (changes.length > 0) {
        await logActivity(
          tx,
          actor,
          {
            action: "UPDATE",
            document: {
              type: SITE_TRANSFER_DOCUMENT_TYPE,
              id: row.id,
              code: row.code,
            },
            summary: changes.map((change) => change.label).join(", "),
            changes,
            anomaly: checked.unusual,
          },
          { now },
        );
      }
      return savedTransferOf(updated as TransferRow);
    });
    return ok(saved);
  });
}

const STATUS_COMMANDS = {
  SEND: { action: "SEND", summary: () => "Gửi điện thoại xác nhận" },
  PULL_BACK: { action: "RETURN", summary: () => "Rút về để sửa" },
  CANCEL: {
    action: "CANCEL",
    summary: (reason: string | null) => `Lý do: ${reason ?? ""}`,
  },
} as const;

/** Gửi điện thoại, rút về, hủy (design D1). */
export function changeSiteTransferStatus(
  db: Database,
  actor: ContractActor,
  ref: string,
  command: keyof typeof STATUS_COMMANDS,
  input: { reason?: string | null; updatedAt?: string } = {},
  options: TransferOptions = {},
): Promise<ServiceResult<SavedTransfer>> {
  return run(async () => {
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    const saved = await db.transaction(async (tx) => {
      const { row, from, to } = await lockTransferWithPair(tx, actor, ref);
      const status = await nextStatus(tx, row, command);
      const reason =
        command === "CANCEL" ? requireTransferReason(input.reason) : null;
      if (command === "SEND") {
        assertFresh(row, input.updatedAt);
        const lines = await readTransferLines(tx, row.id);
        const facts = await itemFacts(
          tx,
          lines.map((line) => line.itemId),
        );
        await checkTransfer(
          tx,
          { from, to },
          {
            lines: lines.map((line) => {
              const info = facts.get(line.itemId) as ItemFacts;
              return {
                itemId: line.itemId,
                itemCode: info.code,
                unit: info.unit,
                milli: line.plannedMilli,
              };
            }),
            otherCustomerConfirmed: row.otherCustomerConfirmed,
            overContractConfirmed: row.overContractConfirmed,
          },
          today,
        );
      }
      const [updated] = await tx
        .update(siteTransfer)
        .set({
          status,
          updatedAt: now,
          ...(command === "SEND" ? { confirmMode: "PHONE" } : {}),
          ...(command === "PULL_BACK" ? { confirmMode: "OFFICE" } : {}),
          ...(command === "CANCEL" ? { cancelledReason: reason } : {}),
        })
        .where(eq(siteTransfer.id, row.id))
        .returning();
      const spec = STATUS_COMMANDS[command];
      await logActivity(
        tx,
        actor,
        {
          action: spec.action,
          document: {
            type: SITE_TRANSFER_DOCUMENT_TYPE,
            id: row.id,
            code: row.code,
          },
          summary: spec.summary(reason),
        },
        { now },
      );
      return savedTransferOf(updated as TransferRow);
    });
    return ok(saved);
  });
}
