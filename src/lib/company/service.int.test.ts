import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { activityLog, companyProfile, user } from "@/db/schema";
import { truncateWithLedger } from "@/test/inventory";

import {
  DEFAULT_COMPANY_NAME,
  getCompanyProfile,
  updateCompanyProfile,
  type Actor,
} from "./service";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const { db, close } = createDatabase(url);

afterAll(close);

beforeEach(async () => {
  await truncateWithLedger(
    sql`truncate table "activity_log", "company_profile", "user" cascade`,
  );
});

const director: Actor = {
  id: "u_dir",
  role: "DIRECTOR",
  device: "DESKTOP",
  browser: "CHROME",
};

const accountant: Actor = {
  id: "u_acc",
  role: "ACCOUNTANT",
  device: "DESKTOP",
  browser: "CHROME",
};

describe("company profile service", () => {
  beforeEach(async () => {
    await db.insert(user).values([
      {
        id: director.id,
        name: "Giám Đốc",
        email: "dir@example.com",
        username: "giamdoc",
        role: "DIRECTOR",
      },
      {
        id: accountant.id,
        name: "Kế Toán",
        email: "acc@example.com",
        username: "ketoan",
        role: "ACCOUNTANT",
      },
    ]);
  });

  describe("getCompanyProfile", () => {
    it("returns default profile when table is empty", async () => {
      const profile = await getCompanyProfile(db);
      expect(profile.name).toBe(DEFAULT_COMPANY_NAME);
      expect(profile.taxId).toBeNull();
    });

    it("returns stored profile when present", async () => {
      await db.insert(companyProfile).values({
        id: 1,
        name: "Công ty Cổ phần Cơ khí An Phát",
        taxId: "0101234567",
      });
      const profile = await getCompanyProfile(db);
      expect(profile.name).toBe("Công ty Cổ phần Cơ khí An Phát");
      expect(profile.taxId).toBe("0101234567");
    });
  });

  describe("updateCompanyProfile", () => {
    it("refuses update if actor is not DIRECTOR", async () => {
      const res = await updateCompanyProfile(db, accountant, {
        name: "Tên Mới",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(403);
      }
    });

    it("refuses update with invalid validation data", async () => {
      const res = await updateCompanyProfile(db, director, {
        name: "", // empty name
        taxId: "12345", // invalid tax ID
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(400);
      }
    });

    it("updates company profile and logs activity when fields change", async () => {
      // Initialize default
      await getCompanyProfile(db);

      const updateInput = {
        name: "Công ty TNHH Giàn Giáo Thăng Long",
        shortName: "Thăng Long",
        taxId: "0109876543-001",
        address: "456 Đường Láng, Hà Nội",
        phone: "0987654321",
        email: "contact@thanglong.vn",
        website: "https://thanglong.vn",
        bankAccount: "9876543210987",
        bankName: "Vietcombank",
        logoUrl: "data:image/png;base64,abc",
      };

      const result = await updateCompanyProfile(db, director, updateInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe("Công ty TNHH Giàn Giáo Thăng Long");
        expect(result.data.taxId).toBe("0109876543-001");
        expect(result.data.updatedBy).toBe(director.id);
      }

      // Verify activity_log
      const logs = await db.select().from(activityLog);
      expect(logs).toHaveLength(1);
      expect(logs[0]?.documentType).toBe("COMPANY_PROFILE");
      expect(logs[0]?.action).toBe("UPDATE");
      expect(logs[0]?.summary).toContain("Cập nhật thông tin công ty");

      // Verify diff changes recorded
      const changes = logs[0]?.changes;
      expect(changes?.some((c) => c.field === "name")).toBe(true);
      expect(changes?.some((c) => c.field === "taxId")).toBe(true);
    });

    it("does not log activity when updated with identical data", async () => {
      // First update
      await updateCompanyProfile(db, director, {
        name: "Công ty Thăng Long",
        taxId: "0109876543",
      });
      expect(await db.select().from(activityLog)).toHaveLength(1);

      // Second update with identical values
      const res2 = await updateCompanyProfile(db, director, {
        name: "Công ty Thăng Long",
        taxId: "0109876543",
      });
      expect(res2.ok).toBe(true);

      // Still 1 log entry
      expect(await db.select().from(activityLog)).toHaveLength(1);
    });
  });
});
