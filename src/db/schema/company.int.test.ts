import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { truncateWithLedger } from "@/test/inventory";

import { user } from "./auth";
import { companyProfile } from "./company";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const { db, close } = createDatabase(url);

afterAll(close);

beforeEach(async () => {
  await truncateWithLedger(
    db,
    sql`truncate table "company_profile", "user" cascade`,
  );
});

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  const cause = (error as { cause?: Record<string, unknown> } | undefined)
    ?.cause;
  return { code: cause?.code, constraint: cause?.constraint_name };
}

describe("company_profile schema", () => {
  it("stores and updates the singleton company profile row", async () => {
    await db.insert(companyProfile).values({
      id: 1,
      name: "Công ty Cổ phần Cơ khí Xây dựng An Phát",
      shortName: "An Phát",
      taxId: "0101234567",
      address: "123 Giải Phóng, Hà Nội",
      phone: "0243123456",
      email: "info@anphat.vn",
      website: "https://anphat.vn",
      bankAccount: "19031234567",
      bankName: "Techcombank",
      logoUrl: "data:image/png;base64,sample",
    });

    const [row] = await db
      .select()
      .from(companyProfile)
      .where(eq(companyProfile.id, 1));
    expect(row).toMatchObject({
      id: 1,
      name: "Công ty Cổ phần Cơ khí Xây dựng An Phát",
      shortName: "An Phát",
      taxId: "0101234567",
      phone: "0243123456",
    });
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });

  it("enforces id = 1 singleton check constraint", async () => {
    const error = await rejection(
      db.insert(companyProfile).values({
        id: 2,
        name: "Công ty Khác",
      }),
    );
    expect(error.constraint).toBe("company_profile_singleton_check");
  });

  it("enforces non-empty name check constraint", async () => {
    const error = await rejection(
      db.insert(companyProfile).values({
        id: 1,
        name: "   ",
      }),
    );
    expect(error.constraint).toBe("company_profile_name_check");
  });

  it("enforces foreign key constraint on updatedBy", async () => {
    const error = await rejection(
      db.insert(companyProfile).values({
        id: 1,
        name: "Công ty An Phát",
        updatedBy: "non-existent-user-id",
      }),
    );
    expect(error.constraint).toBe("company_profile_updated_by_user_id_fk");

    // Works with an existing user
    await db.insert(user).values({
      id: "u_dir",
      name: "Giám Đốc",
      email: "director@example.com",
      username: "giamdoc",
      role: "DIRECTOR",
    });

    await db.insert(companyProfile).values({
      id: 1,
      name: "Công ty An Phát",
      updatedBy: "u_dir",
    });

    const [stored] = await db.select().from(companyProfile);
    expect(stored?.updatedBy).toBe("u_dir");
  });
});
