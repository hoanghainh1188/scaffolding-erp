// Company profile service (spec company-settings, K10).
import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { companyProfile, type CompanyProfileRow } from "@/db/schema/company";
import { diffFields, type FieldSpec } from "@/domain/activity-changes";
import {
  companyProfileInputSchema,
  type CompanyProfile,
  type CompanyProfileInput,
} from "@/domain/company";
import type { ActivityActor } from "@/lib/activity/actor";
import { logActivity, type Tx } from "@/lib/activity/log";

export type Actor = ActivityActor;

export const DEFAULT_COMPANY_NAME = "Công ty Cổ phần Cơ khí Xây dựng An Phát";

const COMPANY_PROFILE_FIELDS: readonly FieldSpec<CompanyProfileInput>[] = [
  { field: "name", label: "Tên công ty", value: (row) => row.name },
  {
    field: "shortName",
    label: "Tên viết tắt",
    value: (row) => row.shortName ?? null,
  },
  { field: "taxId", label: "Mã số thuế", value: (row) => row.taxId ?? null },
  { field: "address", label: "Địa chỉ", value: (row) => row.address ?? null },
  { field: "phone", label: "Số điện thoại", value: (row) => row.phone ?? null },
  { field: "email", label: "Email", value: (row) => row.email ?? null },
  { field: "website", label: "Website", value: (row) => row.website ?? null },
  {
    field: "bankAccount",
    label: "Số tài khoản",
    value: (row) => row.bankAccount ?? null,
    sensitive: "BANK_ACCOUNT",
  },
  {
    field: "bankName",
    label: "Ngân hàng",
    value: (row) => row.bankName ?? null,
  },
  {
    field: "logoUrl",
    label: "Logo",
    value: (row) => (row.logoUrl ? "(đã cập nhật)" : null),
  },
];

function toCompanyProfile(row: CompanyProfileRow): CompanyProfile {
  return {
    name: row.name,
    shortName: row.shortName,
    taxId: row.taxId,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    bankAccount: row.bankAccount,
    bankName: row.bankName,
    logoUrl: row.logoUrl,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Retrieves the current company profile, initializing it with defaults if empty.
 */
export async function getCompanyProfile(
  db: Pick<Database, "select" | "insert">,
): Promise<CompanyProfile> {
  const [row] = await db
    .select()
    .from(companyProfile)
    .where(eq(companyProfile.id, 1));
  if (row) return toCompanyProfile(row);

  const [inserted] = await db
    .insert(companyProfile)
    .values({ id: 1, name: DEFAULT_COMPANY_NAME })
    .onConflictDoNothing()
    .returning();

  if (inserted) return toCompanyProfile(inserted);

  const [refetched] = await db
    .select()
    .from(companyProfile)
    .where(eq(companyProfile.id, 1));
  if (!refetched) {
    throw new Error("Không thể khởi tạo thông tin công ty.");
  }
  return toCompanyProfile(refetched);
}

export type UpdateCompanyResult =
  | { ok: true; data: CompanyProfile }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Updates company profile and writes an activity log if fields changed.
 */
export async function updateCompanyProfile(
  db: Database,
  actor: Actor,
  rawInput: unknown,
): Promise<UpdateCompanyResult> {
  if (actor.role !== "DIRECTOR") {
    return {
      ok: false,
      status: 403,
      error: "Bạn không có quyền cập nhật thông tin công ty",
    };
  }

  const parsed = companyProfileInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const input = parsed.data;

  return db.transaction(async (tx: Tx) => {
    const [existing] = await tx
      .select()
      .from(companyProfile)
      .where(eq(companyProfile.id, 1))
      .for("update");

    const previousInput: CompanyProfileInput = existing
      ? {
          name: existing.name,
          shortName: existing.shortName,
          taxId: existing.taxId,
          address: existing.address,
          phone: existing.phone,
          email: existing.email,
          website: existing.website,
          bankAccount: existing.bankAccount,
          bankName: existing.bankName,
          logoUrl: existing.logoUrl,
        }
      : {
          name: DEFAULT_COMPANY_NAME,
          shortName: null,
          taxId: null,
          address: null,
          phone: null,
          email: null,
          website: null,
          bankAccount: null,
          bankName: null,
          logoUrl: null,
        };

    const changes = diffFields(COMPANY_PROFILE_FIELDS, previousInput, input);

    if (changes.length > 0 || !existing) {
      const now = new Date();
      await tx
        .insert(companyProfile)
        .values({
          id: 1,
          ...input,
          updatedBy: actor.id,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: companyProfile.id,
          set: {
            ...input,
            updatedBy: actor.id,
            updatedAt: now,
          },
        });

      if (changes.length > 0) {
        await logActivity(tx, actor, {
          action: "UPDATE",
          document: {
            type: "COMPANY_PROFILE",
            id: "1",
            code: null,
          },
          summary: "Cập nhật thông tin công ty",
          changes,
        });
      }
    }

    const [updated] = await tx
      .select()
      .from(companyProfile)
      .where(eq(companyProfile.id, 1));
    if (!updated) {
      throw new Error("Không thể lưu thông tin công ty.");
    }
    return { ok: true as const, data: toCompanyProfile(updated) };
  });
}
