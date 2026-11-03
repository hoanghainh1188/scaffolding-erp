// Planning delivery batches and moving them through their statuses
// (deliveries design D1, D3, D4, D6, D7, D11). Every command locks the
// contract, then the note, FOR UPDATE before it checks anything, and logs
// one activity row in the same transaction.
import { asc, eq, inArray, max } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  deliveryNote,
  deliveryNoteKit,
  deliveryNoteLine,
  kit,
  location,
  site,
} from "@/db/schema";
import { diffFields, type FieldSpec } from "@/domain/activity-changes";
import {
  formatBusinessDate,
  isBusinessDate,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import type { ContractType } from "@/domain/contract";
import {
  byWeight,
  PRICING_UNITS,
  SALE_CONDITIONS,
  type PricingUnit,
  type SaleCondition,
} from "@/domain/contract-lines";
import {
  assertContractDeliverable,
  checkOverDelivery,
  DELIVERY_MESSAGES,
  explodeDelivery,
  remainingToDeliver,
  requireReason,
  transition,
  type DeliveryCommand,
  type DeliveryStatus,
  type OverLine,
  type PlannedLine,
  type TermsLine,
} from "@/domain/delivery-note";
import { batchText, createdSummary } from "@/domain/delivery-summary";
import { DomainValueError } from "@/domain/errors";
import { formatMoney, toMoney } from "@/domain/money";
import { can } from "@/domain/permissions";
import { parseQuantity } from "@/domain/quantity";
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
  forbidden,
  run,
  type ContractActor,
  type Tx,
} from "@/lib/contracts/common";
import { lockContract, type LockedContract } from "@/lib/contracts/records";
import { contractTermsAt } from "@/lib/contracts/terms";
import { nextDocumentCode } from "@/lib/inventory/counter";

import {
  db3,
  DELIVERY_DOCUMENT_TYPE,
  DELIVERY_PREFIX,
  doneByLine,
  findNote,
  isUuid,
  itemFacts,
  kitsWithParts,
  laterItems,
  lockNote,
  openByLine,
  readNoteContent,
  termsLines,
  type ItemFacts,
  type NoteRow,
} from "./records";

export const SERVICE_MESSAGES = {
  stale: "Phiếu vừa được người khác sửa. Bạn tải lại để xem bản mới.",
  freight: "Cước vận chuyển không được âm.",
  freightWhole: "Cước vận chuyển phải là số nguyên đồng.",
  plate: "Biển số xe tối đa 20 ký tự.",
  note: "Ghi chú tối đa 500 ký tự.",
  plannedDate: "Ngày dự kiến không hợp lệ.",
  notYard: "Phiếu xuất chỉ lấy hàng từ bãi.",
  yardArchived: (code: string) =>
    `Bãi ${code} đã ngừng dùng. Bạn chọn bãi khác.`,
  noYard: "Chưa có bãi nào đang dùng để xuất hàng.",
  chooseYard: "Bạn chọn bãi xuất hàng.",
  quantity: "Số lượng phải lớn hơn 0.",
  item: "Bạn chọn mã hàng.",
  kit: "Bạn chọn bộ và số bộ.",
  condition: "Chọn tình trạng và cách tính của dòng bán.",
  noSite: "Công trình của hợp đồng chưa có vị trí kho.",
} as const;

export interface DeliveryBody {
  contractId?: string;
  sourceLocationId?: string | null;
  plannedDate?: string | null;
  kits?: { kitId?: string; quantity?: number }[];
  lines?: {
    itemId?: string;
    condition?: string | null;
    pricingUnit?: string | null;
    quantity?: string;
  }[];
  companyTruck?: boolean;
  freightAmount?: number | null;
  vehiclePlate?: string | null;
  note?: string | null;
  overContractConfirmed?: boolean;
  /** Edits only: when the note was last saved (409 when stale). */
  updatedAt?: string;
}

export interface SavedNote {
  id: string;
  code: string;
  batchNo: number;
  status: DeliveryStatus;
  updatedAt: string;
}

export interface CommandOptions {
  now?: Date;
}

const field = (message: string, name: string) =>
  new ContractFieldError(message, name);

const savedOf = (row: NoteRow): SavedNote => ({
  id: row.id,
  code: row.code,
  batchNo: row.batchNo,
  status: row.status as DeliveryStatus,
  updatedAt: row.updatedAt.toISOString(),
});

function optionalText(
  value: string | null | undefined,
  maxLength: number,
  message: string,
  name: string,
): string | null {
  const text = (value ?? "").trim();
  if (text === "") return null;
  if (text.length > maxLength) throw field(message, name);
  return text;
}

// ----------------------------------------------------------- body

interface ParsedBody {
  plannedDate: BusinessDate | null;
  kits: { kitId: string; quantity: number }[];
  own: { itemId: string; itemCode: string; ownMilli: number }[];
  sale: {
    itemId: string;
    condition: SaleCondition;
    pricingUnit: PricingUnit;
    quantityMilli: number;
  }[];
  vehiclePlate: string | null;
  note: string | null;
}

function parseBody(
  body: DeliveryBody,
  type: ContractType,
  facts: Map<string, ItemFacts>,
): ParsedBody {
  const planned = (body.plannedDate ?? "").trim();
  if (planned !== "" && !isBusinessDate(planned)) {
    throw field(SERVICE_MESSAGES.plannedDate, "plannedDate");
  }
  const kits = (body.kits ?? []).map((kit, index) => {
    if (!isUuid(kit.kitId) || !Number.isInteger(kit.quantity)) {
      throw field(SERVICE_MESSAGES.kit, `kits.${index}.quantity`);
    }
    return { kitId: kit.kitId, quantity: kit.quantity as number };
  });
  const own: ParsedBody["own"] = [];
  const sale: ParsedBody["sale"] = [];
  (body.lines ?? []).forEach((line, index) => {
    const info = isUuid(line.itemId) ? facts.get(line.itemId) : undefined;
    if (!info) throw field(SERVICE_MESSAGES.item, `lines.${index}.itemId`);
    const name = `lines.${index}.quantity`;
    if (type === "SALE") {
      const condition = line.condition as SaleCondition;
      const pricingUnit = line.pricingUnit as PricingUnit;
      if (
        !SALE_CONDITIONS.includes(condition) ||
        !PRICING_UNITS.includes(pricingUnit)
      ) {
        throw field(SERVICE_MESSAGES.condition, `lines.${index}.condition`);
      }
      const unit = byWeight(pricingUnit) ? "KG" : info.unit;
      const quantityMilli = parse(line.quantity, unit, name);
      sale.push({ itemId: info.id, condition, pricingUnit, quantityMilli });
    } else {
      own.push({
        itemId: info.id,
        itemCode: info.code,
        ownMilli: parse(line.quantity, info.unit, name),
      });
    }
  });
  return {
    plannedDate: planned === "" ? null : (planned as BusinessDate),
    kits,
    own,
    sale,
    vehiclePlate: optionalText(
      body.vehiclePlate,
      20,
      SERVICE_MESSAGES.plate,
      "vehiclePlate",
    ),
    note: optionalText(body.note, 500, SERVICE_MESSAGES.note, "note"),
  };
}

function parse(
  value: string | undefined,
  unit: ItemFacts["unit"],
  name: string,
): number {
  try {
    const quantity = parseQuantity(value ?? "", unit);
    if (quantity.milli <= 0) throw field(SERVICE_MESSAGES.quantity, name);
    return quantity.milli;
  } catch (error: unknown) {
    if (error instanceof ContractFieldError) throw error;
    if (error instanceof DomainValueError) throw field(error.message, name);
    throw error;
  }
}

/** Company truck and freight: the contract's by default (design D6). */
function freightOf(
  body: DeliveryBody,
  defaults: { companyTruck: boolean; freightPerTrip: number | null },
): { companyTruck: boolean; freightAmount: number | null } {
  const companyTruck = body.companyTruck ?? defaults.companyTruck;
  if (!companyTruck) return { companyTruck, freightAmount: null };
  const amount =
    body.freightAmount === undefined
      ? defaults.freightPerTrip
      : body.freightAmount;
  if (amount === null) return { companyTruck, freightAmount: null };
  if (!Number.isSafeInteger(amount)) {
    throw field(SERVICE_MESSAGES.freightWhole, "freightAmount");
  }
  if (amount < 0) throw field(SERVICE_MESSAGES.freight, "freightAmount");
  return { companyTruck, freightAmount: amount };
}

// ----------------------------------------------------------- places

/** The yard to ship from: the one asked for, or the only one (design D7). */
async function resolveYard(
  tx: Tx,
  locationId: string | null | undefined,
): Promise<{ id: string; code: string }> {
  if (locationId) {
    if (!isUuid(locationId)) {
      throw field(SERVICE_MESSAGES.chooseYard, "sourceLocationId");
    }
    const [row] = await tx
      .select({
        id: location.id,
        code: location.code,
        type: location.type,
        status: location.status,
      })
      .from(location)
      .where(eq(location.id, locationId))
      .for("share");
    if (!row) throw field(SERVICE_MESSAGES.chooseYard, "sourceLocationId");
    if (row.type !== "YARD") {
      throw field(SERVICE_MESSAGES.notYard, "sourceLocationId");
    }
    if (row.status !== "ACTIVE") {
      throw field(SERVICE_MESSAGES.yardArchived(row.code), "sourceLocationId");
    }
    return row;
  }
  const active = await tx
    .select({ id: location.id, code: location.code, status: location.status })
    .from(location)
    .where(eq(location.type, "YARD"))
    .orderBy(asc(location.code))
    .for("share");
  const usable = active.filter((row) => row.status === "ACTIVE");
  if (usable.length === 0) throw new DomainValueError(SERVICE_MESSAGES.noYard);
  if (usable.length > 1) {
    throw field(SERVICE_MESSAGES.chooseYard, "sourceLocationId");
  }
  return usable[0] as { id: string; code: string };
}

async function siteLocationOf(
  tx: Tx,
  contract: LockedContract,
): Promise<string | null> {
  if (contract.type === "SALE" || contract.siteId === null) return null;
  const [row] = await tx
    .select({ locationId: site.locationId })
    .from(site)
    .where(eq(site.id, contract.siteId));
  if (!row) throw new DomainValueError(SERVICE_MESSAGES.noSite);
  return row.locationId;
}

// ----------------------------------------------------------- planning

interface Plan {
  parsed: ParsedBody;
  lines: PlannedLine[];
  over: OverLine[];
  terms: TermsLine[];
  freight: { companyTruck: boolean; freightAmount: number | null };
  yard: { id: string; code: string };
}

/** Everything a create or edit checks before it writes (design D3, D4). */
async function plan(
  tx: Tx,
  contract: LockedContract,
  body: DeliveryBody,
  today: BusinessDate,
  exceptNoteId: string | null,
): Promise<Plan> {
  assertContractDeliverable(contract.status);
  const terms = await contractTermsAt(tx, contract.id, today);
  if (!terms) throw new DomainValueError(DELIVERY_MESSAGES.contractNotApproved);
  const facts = await itemFacts(
    tx,
    (body.lines ?? [])
      .map((line) => line.itemId)
      .filter((id): id is string => isUuid(id)),
  );
  const parsed = parseBody(body, contract.type, facts);
  const tLines = await termsLines(tx, terms);
  const lines = explodeDelivery({
    type: contract.type,
    kits: await kitsWithParts(tx, parsed.kits),
    own: parsed.own,
    sale: parsed.sale,
    terms: tLines,
    later: await laterItems(tx, contract.id, today),
  });
  const remaining = remainingToDeliver({
    type: contract.type,
    terms: tLines,
    done: await doneByLine(tx, contract.type, contract.id),
    open: await openByLine(tx, contract.id, exceptNoteId),
  });
  const over = checkOverDelivery(
    contract.type,
    lines,
    remaining,
    body.overContractConfirmed === true,
  );
  return {
    parsed,
    lines,
    over,
    terms: tLines,
    freight: freightOf(body, terms),
    yard: await resolveYard(tx, body.sourceLocationId),
  };
}

async function writeContent(tx: Tx, noteId: string, plan: Plan) {
  if (plan.parsed.kits.length > 0) {
    await tx
      .insert(deliveryNoteKit)
      .values(plan.parsed.kits.map((kit) => ({ noteId, ...kit })));
  }
  await tx.insert(deliveryNoteLine).values(
    plan.lines.map((line, index) => ({
      noteId,
      lineNo: index + 1,
      itemId: line.itemId,
      condition: line.condition,
      pricingUnit: line.pricingUnit,
      requestedQuantity: db3(line.requestedMilli),
    })),
  );
}

async function kitNames(
  tx: Tx,
  kits: readonly { kitId: string; quantity: number }[],
) {
  if (kits.length === 0) return [];
  const rows = await tx
    .select({ id: kit.id, name: kit.name })
    .from(kit)
    .where(
      inArray(
        kit.id,
        kits.map((entry) => entry.kitId),
      ),
    );
  const names = new Map(rows.map((row) => [row.id, row.name]));
  return kits.map((entry) => ({
    kitName: names.get(entry.kitId) ?? "",
    quantity: entry.quantity,
  }));
}

function overAmounts(over: readonly OverLine[]) {
  return over.map((row) => ({
    itemCode: row.itemCode,
    unit: row.unit,
    milli: row.overMilli,
  }));
}

/** "Tạo đợt xuất" (deliveries spec "Phiếu xuất theo đợt của hợp đồng"). */
export function createDelivery(
  db: Database,
  actor: ContractActor,
  body: DeliveryBody,
  options: CommandOptions = {},
): Promise<ServiceResult<SavedNote>> {
  return run(async () => {
    if (!isUuid(body.contractId)) {
      throw field(SERVICE_MESSAGES.item, "contractId");
    }
    const contractId = body.contractId;
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    const saved = await db.transaction(async (tx) => {
      const contract = await lockContract(tx, contractId);
      assertContractAccess(actor, contract.type, "manage");
      const planned = await plan(tx, contract, body, today, null);
      const code = await nextDocumentCode(
        tx,
        DELIVERY_PREFIX,
        Number(today.slice(0, 4)),
      );
      const [last] = await tx
        .select({ batchNo: max(deliveryNote.batchNo) })
        .from(deliveryNote)
        .where(eq(deliveryNote.contractId, contract.id));
      const batchNo = (last?.batchNo ?? 0) + 1;
      const [row] = await tx
        .insert(deliveryNote)
        .values({
          code,
          contractId: contract.id,
          batchNo,
          sourceLocationId: planned.yard.id,
          siteLocationId: await siteLocationOf(tx, contract),
          plannedDate: planned.parsed.plannedDate,
          ...planned.freight,
          vehiclePlate: planned.parsed.vehiclePlate,
          note: planned.parsed.note,
          overContractConfirmed: planned.over.length > 0,
          createdBy: actor.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const note = row as NoteRow;
      await writeContent(tx, note.id, planned);
      await logActivity(
        tx,
        actor,
        {
          action: "CREATE",
          document: { type: DELIVERY_DOCUMENT_TYPE, id: note.id, code },
          summary: createdSummary({
            batchNo,
            kits: await kitNames(tx, planned.parsed.kits),
            lineCount: planned.lines.length,
            freight: planned.freight.freightAmount,
            over: overAmounts(planned.over),
          }),
          anomaly: planned.over.length > 0,
        },
        { now },
      );
      return savedOf(note);
    });
    return ok(saved);
  });
}

// ----------------------------------------------------------- editing

interface Shown {
  goods: string;
  yard: string;
  plannedDate: string | null;
  freight: string | null;
  plate: string | null;
  note: string | null;
}

const SHOWN_FIELDS: readonly FieldSpec<Shown>[] = [
  { field: "goods", label: "Hàng", value: (row) => row.goods },
  { field: "sourceLocationId", label: "Bãi", value: (row) => row.yard },
  {
    field: "plannedDate",
    label: "Ngày dự kiến",
    value: (row) => row.plannedDate,
  },
  { field: "freightAmount", label: "Cước", value: (row) => row.freight },
  { field: "vehiclePlate", label: "Biển số", value: (row) => row.plate },
  { field: "note", label: "Ghi chú", value: (row) => row.note },
];

async function shownOf(
  tx: Tx,
  input: {
    kits: readonly { kitId: string; quantity: number }[];
    lines: readonly {
      itemId: string;
      requestedMilli: number;
      condition: string | null;
      pricingUnit: string | null;
    }[];
    yardId: string;
    plannedDate: string | null;
    companyTruck: boolean;
    freightAmount: number | null;
    vehiclePlate: string | null;
    note: string | null;
  },
): Promise<Shown> {
  const facts = await itemFacts(
    tx,
    input.lines.map((line) => line.itemId),
  );
  const [yard] = await tx
    .select({ code: location.code })
    .from(location)
    .where(eq(location.id, input.yardId));
  return {
    goods: batchText(
      await kitNames(tx, input.kits),
      input.lines.map((line) => {
        const info = facts.get(line.itemId);
        return {
          itemCode: info?.code ?? "",
          itemName: info?.name ?? "",
          unit: byWeight(line.pricingUnit ?? "")
            ? "KG"
            : (info?.unit ?? "PIECE"),
          milli: line.requestedMilli,
        };
      }),
    ),
    yard: yard?.code ?? "",
    plannedDate: input.plannedDate
      ? formatBusinessDate(input.plannedDate)
      : null,
    freight: !input.companyTruck
      ? "Khách tự chở"
      : input.freightAmount === null
        ? "Công ty gọi xe"
        : formatMoney(toMoney(input.freightAmount)),
    plate: input.vehiclePlate,
    note: input.note,
  };
}

async function lockBoth(
  tx: Tx,
  noteId: string,
): Promise<{ contract: LockedContract; note: NoteRow }> {
  const found = await findNote(tx, noteId);
  if (!found) throw new ServiceFailure(notFound());
  const contract = await lockContract(tx, found.contractId);
  const note = await lockNote(tx, found.id);
  return { contract, note };
}

function assertFresh(note: NoteRow, updatedAt: string | undefined) {
  if (
    !updatedAt ||
    new Date(updatedAt).getTime() !== note.updatedAt.getTime()
  ) {
    throw new ServiceFailure(conflict(SERVICE_MESSAGES.stale));
  }
}

/** Saving a PLANNED note again (spec "Chỉ sửa phiếu Chờ nhặt"). */
export function updateDelivery(
  db: Database,
  actor: ContractActor,
  noteId: string,
  body: DeliveryBody,
  options: CommandOptions = {},
): Promise<ServiceResult<SavedNote>> {
  return run(async () => {
    const now = options.now ?? new Date();
    const today = toBusinessDate(now);
    const saved = await db.transaction(async (tx) => {
      const { contract, note } = await lockBoth(tx, noteId);
      assertContractAccess(actor, contract.type, "manage");
      transition(note.status as DeliveryStatus, "EDIT", note.code);
      assertFresh(note, body.updatedAt);
      const before = await readNoteContent(tx, note.id);
      const planned = await plan(tx, contract, body, today, note.id);
      const beforeShown = await shownOf(tx, {
        kits: before.kits,
        lines: before.lines,
        yardId: note.sourceLocationId,
        plannedDate: note.plannedDate,
        companyTruck: note.companyTruck,
        freightAmount: note.freightAmount,
        vehiclePlate: note.vehiclePlate,
        note: note.note,
      });
      const afterShown = await shownOf(tx, {
        kits: planned.parsed.kits,
        lines: planned.lines,
        yardId: planned.yard.id,
        plannedDate: planned.parsed.plannedDate,
        ...planned.freight,
        vehiclePlate: planned.parsed.vehiclePlate,
        note: planned.parsed.note,
      });
      const changes = diffFields(SHOWN_FIELDS, beforeShown, afterShown);
      if (changes.length === 0) return savedOf(note);
      await tx
        .delete(deliveryNoteKit)
        .where(eq(deliveryNoteKit.noteId, note.id));
      await tx
        .delete(deliveryNoteLine)
        .where(eq(deliveryNoteLine.noteId, note.id));
      await writeContent(tx, note.id, planned);
      const [row] = await tx
        .update(deliveryNote)
        .set({
          sourceLocationId: planned.yard.id,
          plannedDate: planned.parsed.plannedDate,
          ...planned.freight,
          vehiclePlate: planned.parsed.vehiclePlate,
          note: planned.parsed.note,
          overContractConfirmed: planned.over.length > 0,
          updatedAt: now,
        })
        .where(eq(deliveryNote.id, note.id))
        .returning();
      await logActivity(
        tx,
        actor,
        {
          action: "UPDATE",
          document: {
            type: DELIVERY_DOCUMENT_TYPE,
            id: note.id,
            code: note.code,
          },
          summary: changes.map((change) => change.label).join(", "),
          changes,
          anomaly: planned.over.length > 0,
        },
        { now },
      );
      return savedOf(row as NoteRow);
    });
    return ok(saved);
  });
}

// ----------------------------------------------------------- statuses

type Who = "PICKER" | "OFFICE";

const COMMANDS: Readonly<
  Record<
    "START" | "RETURN" | "RECALL" | "CANCEL",
    { who: Who; reason: string | null; action: "START" | "RETURN" | "CANCEL" }
  >
> = {
  START: { who: "PICKER", reason: null, action: "START" },
  RETURN: {
    who: "PICKER",
    reason: DELIVERY_MESSAGES.returnReason,
    action: "RETURN",
  },
  RECALL: {
    who: "OFFICE",
    reason: DELIVERY_MESSAGES.recallReason,
    action: "RETURN",
  },
  CANCEL: {
    who: "OFFICE",
    reason: DELIVERY_MESSAGES.cancelReason,
    action: "CANCEL",
  },
};

/** Who may pick and confirm: the storekeeper, the director (design D11). */
export function assertPicker(actor: ContractActor): void {
  if (!can(actor.role, "deliveries.pick")) {
    throw new ServiceFailure(forbidden());
  }
}

function summaryOf(command: keyof typeof COMMANDS, reason: string | null) {
  if (command === "START") return "Thủ kho bắt đầu nhặt hàng";
  if (command === "RETURN") return `Trả lại văn phòng: ${reason ?? ""}`;
  if (command === "RECALL") return `Rút về để sửa: ${reason ?? ""}`;
  return `Lý do: ${reason ?? ""}`;
}

/** Bắt đầu nhặt, trả lại văn phòng, rút về để sửa, hủy (design D1). */
export function changeDeliveryStatus(
  db: Database,
  actor: ContractActor,
  noteId: string,
  command: keyof typeof COMMANDS,
  reason: string | null = null,
  options: CommandOptions = {},
): Promise<ServiceResult<SavedNote>> {
  return run(async () => {
    const now = options.now ?? new Date();
    const spec = COMMANDS[command];
    const saved = await db.transaction(async (tx) => {
      const { contract, note } = await lockBoth(tx, noteId);
      if (spec.who === "PICKER") assertPicker(actor);
      else assertContractAccess(actor, contract.type, "manage");
      const status = transition(
        note.status as DeliveryStatus,
        command as DeliveryCommand,
        note.code,
      );
      const text =
        spec.reason === null ? null : requireReason(reason, spec.reason);
      if (command === "START") assertContractDeliverable(contract.status);
      const [row] = await tx
        .update(deliveryNote)
        .set({
          status,
          updatedAt: now,
          ...(command === "START"
            ? { pickingBy: actor.id, pickingStartedAt: now }
            : {}),
          ...(command === "RETURN" || command === "RECALL"
            ? { pickingBy: null, pickingStartedAt: null, returnedReason: text }
            : {}),
          ...(command === "CANCEL" ? { cancelledReason: text } : {}),
        })
        .where(eq(deliveryNote.id, note.id))
        .returning();
      await logActivity(
        tx,
        actor,
        {
          action: spec.action,
          document: {
            type: DELIVERY_DOCUMENT_TYPE,
            id: note.id,
            code: note.code,
          },
          summary: summaryOf(command, text),
        },
        { now },
      );
      return savedOf(row as NoteRow);
    });
    return ok(saved);
  });
}
