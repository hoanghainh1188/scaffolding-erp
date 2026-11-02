// Drafting contracts (contracts spec, design D1, D7, D14): "Lưu nháp" on
// D5a creates the contract with its number, then edits the original
// revision while it is a draft. Each write is one transaction: the contract
// FOR UPDATE, the customer, site, items and kits FOR SHARE.
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { contract, contractRevision, customer, site } from "@/db/schema";
import { changeSummary } from "@/domain/activity-summary";
import {
  CONTRACT_MESSAGES,
  CONTRACT_TYPES,
  editBlocker,
  type ContractType,
} from "@/domain/contract";
import { diffRevisions } from "@/domain/contract-revision";
import { contractSummary } from "@/domain/contract-summary";
import {
  conflict,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import { logActivity } from "@/lib/activity/log";

import {
  assertContractAccess,
  ContractFieldError,
  run,
  type ContractActor,
  type Tx,
} from "./common";
import {
  checkContent,
  checkTerms,
  comparable,
  EMPTY_CONTENT,
  readContent,
  writeContent,
  type ContentBody,
  type TermsBody,
} from "./content";
import { companyToken, customerTokenFor, issueContractCode } from "./numbering";
import {
  lockContract,
  lockRevision,
  termColumns,
  termsOf,
  valueOf,
} from "./records";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PARTY_MESSAGES = {
  type: "Chọn loại hợp đồng (Cho thuê hoặc Bán).",
  customer: "Chọn nhà thầu",
  customerArchived: (code: string) => `Nhà thầu ${code} đã ngừng dùng.`,
  siteRequired: "Hợp đồng cho thuê cần một công trình.",
  site: "Chọn công trình",
  siteArchived: (code: string) => `Công trình ${code} đã ngừng dùng.`,
  siteOfOther: (siteCode: string, customerName: string) =>
    `Công trình ${siteCode} không thuộc nhà thầu ${customerName}. Bạn chọn lại công trình của nhà thầu này.`,
  typeFixed:
    "Hợp đồng đã lưu nên không đổi loại được. Bạn hủy nháp này và lập hợp đồng mới.",
  customerFixed: (name: string) =>
    `Hợp đồng đã có số theo nhà thầu ${name} nên không đổi nhà thầu được. Bạn hủy nháp này và lập hợp đồng mới.`,
} as const;

export interface ContractBody extends TermsBody, ContentBody {
  type?: string;
  customerId?: string;
  siteId?: string | null;
  /** The <KHÁCH> part of the number; first save only. */
  customerToken?: string | null;
  /** The contract's updatedAt the form was opened with (edits only). */
  updatedAt?: string;
}

export interface SavedContract {
  id: string;
  code: string;
  updatedAt: string;
}

interface Party {
  customer: {
    id: string;
    code: string;
    name: string;
    paymentTermsDays: number;
    salesUserId: string | null;
  };
  site: { id: string; code: string; name: string } | null;
}

/** Customer and site FOR SHARE, the site belonging to the customer. */
async function lockParty(
  tx: Tx,
  type: ContractType,
  customerId: string | undefined,
  siteId: string | null | undefined,
): Promise<Party> {
  if (!customerId || !UUID.test(customerId)) {
    throw new ContractFieldError(PARTY_MESSAGES.customer, "customerId");
  }
  const [buyer] = await tx
    .select({
      id: customer.id,
      code: customer.code,
      name: customer.name,
      status: customer.status,
      paymentTermsDays: customer.paymentTermsDays,
      salesUserId: customer.salesUserId,
    })
    .from(customer)
    .where(eq(customer.id, customerId))
    .for("share");
  if (!buyer)
    throw new ContractFieldError(PARTY_MESSAGES.customer, "customerId");
  if (buyer.status !== "ACTIVE") {
    throw new ContractFieldError(
      PARTY_MESSAGES.customerArchived(buyer.code),
      "customerId",
    );
  }
  if (!siteId) {
    if (type === "RENTAL") {
      throw new ContractFieldError(PARTY_MESSAGES.siteRequired, "siteId");
    }
    return { customer: buyer, site: null };
  }
  if (!UUID.test(siteId))
    throw new ContractFieldError(PARTY_MESSAGES.site, "siteId");
  const [place] = await tx
    .select({
      id: site.id,
      code: site.code,
      name: site.name,
      status: site.status,
      customerId: site.customerId,
    })
    .from(site)
    .where(eq(site.id, siteId))
    .for("share");
  if (!place) throw new ContractFieldError(PARTY_MESSAGES.site, "siteId");
  if (place.customerId !== buyer.id) {
    throw new ContractFieldError(
      PARTY_MESSAGES.siteOfOther(place.code, buyer.name),
      "siteId",
    );
  }
  if (place.status !== "ACTIVE") {
    throw new ContractFieldError(
      PARTY_MESSAGES.siteArchived(place.code),
      "siteId",
    );
  }
  return { customer: buyer, site: place };
}

function typeOf(value: string | undefined): ContractType {
  if (!(CONTRACT_TYPES as readonly string[]).includes(value ?? "")) {
    throw new ContractFieldError(PARTY_MESSAGES.type, "type");
  }
  return value as ContractType;
}

/** "Lưu nháp" the first time: number, contract, original revision. */
export function createContract(
  db: Database,
  actor: ContractActor,
  body: ContractBody,
): Promise<ServiceResult<SavedContract>> {
  return run(async () => {
    const type = typeOf(body.type);
    assertContractAccess(actor, type, "manage");
    const saved = await db.transaction(async (tx) => {
      const party = await lockParty(tx, type, body.customerId, body.siteId);
      const terms = checkTerms(type, body, party.customer);
      const content = await checkContent(tx, type, body, EMPTY_CONTENT);
      const short = await companyToken(tx);
      const token = await customerTokenFor(
        tx,
        party.customer,
        body.customerToken,
      );
      const code = await issueContractCode(tx, short, token, terms.startDate);
      const [row] = await tx
        .insert(contract)
        .values({
          code,
          type,
          customerId: party.customer.id,
          siteId: party.site?.id ?? null,
          salesUserId: party.customer.salesUserId,
          customerToken: token,
          createdBy: actor.id,
        })
        .returning({ id: contract.id, updatedAt: contract.updatedAt });
      if (!row) throw new Error("contract insert returned nothing");
      const [revision] = await tx
        .insert(contractRevision)
        .values({
          ...termColumns(terms),
          contractId: row.id,
          number: 0,
          kind: "ORIGINAL",
          code,
          effectiveFrom: terms.startDate,
          createdBy: actor.id,
        })
        .returning({ id: contractRevision.id });
      if (!revision) throw new Error("revision insert returned nothing");
      await writeContent(tx, revision.id, content);
      await logActivity(tx, actor, {
        action: "CREATE",
        document: { type: "CONTRACT", id: row.id, code },
        summary: contractSummary({
          type,
          customer: party.customer.name,
          site: party.site?.name ?? null,
          itemCount: content.lines.length,
          value: valueOf(type, terms, content),
        }),
      });
      return { id: row.id, code, updatedAt: row.updatedAt.toISOString() };
    });
    return ok(saved);
  });
}

/** "Lưu nháp" again: whole body, guarded by updatedAt. Drafts only. */
export function updateContract(
  db: Database,
  actor: ContractActor,
  id: string,
  body: ContractBody,
): Promise<ServiceResult<SavedContract>> {
  return run(async () => {
    const saved = await db.transaction(async (tx) => {
      const locked = await lockContract(tx, id);
      assertContractAccess(actor, locked.type, "manage");
      const seen = body.updatedAt ? new Date(body.updatedAt).getTime() : NaN;
      if (seen !== locked.updatedAt.getTime()) {
        throw new ServiceFailure(conflict(CONTRACT_MESSAGES.stale));
      }
      const blocker = editBlocker(locked.status);
      if (blocker) throw new ServiceFailure(conflict(blocker));
      if (body.type !== undefined && body.type !== locked.type) {
        throw new ServiceFailure(conflict(PARTY_MESSAGES.typeFixed));
      }
      const [oldSite] = locked.siteId
        ? await tx
            .select({ code: site.code })
            .from(site)
            .where(eq(site.id, locked.siteId))
        : [];
      if (
        body.customerId !== undefined &&
        body.customerId !== locked.customerId
      ) {
        const [buyer] = await tx
          .select({ name: customer.name })
          .from(customer)
          .where(eq(customer.id, locked.customerId));
        throw new ServiceFailure(
          conflict(PARTY_MESSAGES.customerFixed(buyer?.name ?? "")),
        );
      }
      const party = await lockParty(
        tx,
        locked.type,
        locked.customerId,
        body.siteId === undefined ? locked.siteId : body.siteId,
      );
      const revision = await lockRevision(tx, locked.id, 0);
      const previous = await readContent(tx, revision.id);
      const terms = checkTerms(locked.type, body, party.customer);
      const content = await checkContent(tx, locked.type, body, previous);
      const head = (siteCode: string | null) => ({
        type: locked.type,
        customerId: party.customer.code,
        siteId: siteCode,
      });
      const changes = diffRevisions(
        await comparable(
          tx,
          head(oldSite?.code ?? null),
          termsOf(revision),
          previous,
        ),
        await comparable(tx, head(party.site?.code ?? null), terms, content),
      );
      const now = new Date();
      await tx
        .update(contractRevision)
        .set({
          ...termColumns(terms),
          effectiveFrom: terms.startDate,
          updatedAt: now,
        })
        .where(eq(contractRevision.id, revision.id));
      await writeContent(tx, revision.id, content);
      await tx
        .update(contract)
        .set({ siteId: party.site?.id ?? null, updatedAt: now })
        .where(eq(contract.id, locked.id));
      await logActivity(tx, actor, {
        action: "UPDATE",
        document: { type: "CONTRACT", id: locked.id, code: locked.code },
        summary: changeSummary(changes),
        changes,
      });
      return { id: locked.id, code: locked.code, updatedAt: now.toISOString() };
    });
    return ok(saved);
  });
}
