import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { truncateWithLedger } from "@/test/inventory";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  resetAuthTables,
  signInAs,
  type TestUser,
} from "@/test/auth";

import { GET, PUT } from "./route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);

afterAll(async () => {
  uninstall();
  await ctx.close();
});

let director: TestUser;
let accountant: TestUser;
let warehouse: TestUser;

beforeEach(async () => {
  await resetAuthTables(ctx);
  await truncateWithLedger(
    ctx.db,
    sql`truncate table "activity_log", "company_profile" cascade`,
  );

  director = await createTestUser(ctx, {
    role: "DIRECTOR",
    username: "giamdoc",
    name: "Giám Đốc",
  });
  accountant = await createTestUser(ctx, {
    role: "ACCOUNTANT",
    username: "ketoan",
    name: "Kế Toán",
  });
  warehouse = await createTestUser(ctx, {
    role: "WAREHOUSE",
    username: "thukho",
    name: "Thủ Kho",
  });
});

describe("GET /api/settings/company", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await GET(appRequest("/api/settings/company"));
    expect(res.status).toBe(401);
  });

  it("allows any authenticated role to read company profile", async () => {
    const accCookie = await signInAs(ctx, accountant);
    const resAcc = await GET(
      appRequest("/api/settings/company", { cookie: accCookie }),
    );
    expect(resAcc.status).toBe(200);
    const dataAcc = await resAcc.json();
    expect(dataAcc.data.name).toBeDefined();

    const whCookie = await signInAs(ctx, warehouse);
    const resWh = await GET(
      appRequest("/api/settings/company", { cookie: whCookie }),
    );
    expect(resWh.status).toBe(200);
  });
});

describe("PUT /api/settings/company", () => {
  it("forbids non-director roles with 403", async () => {
    const accCookie = await signInAs(ctx, accountant);
    const res = await PUT(
      appRequest("/api/settings/company", {
        method: "PUT",
        cookie: accCookie,
        body: { name: "Tên Mới" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("validates input and returns 400 on error", async () => {
    const dirCookie = await signInAs(ctx, director);
    const res = await PUT(
      appRequest("/api/settings/company", {
        method: "PUT",
        cookie: dirCookie,
        body: { name: "", taxId: "123" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("updates company profile successfully for director", async () => {
    const dirCookie = await signInAs(ctx, director);
    const updateData = {
      name: "Công ty Cổ phần Cơ khí Xây dựng An Phát",
      shortName: "An Phát",
      taxId: "0101234567-001",
      address: "123 Đường Giải Phóng, Hà Nội",
      phone: "0243888888",
      email: "contact@anphat.vn",
      website: "https://anphat.vn",
      bankAccount: "1903123456789",
      bankName: "Techcombank",
      logoUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    };

    const res = await PUT(
      appRequest("/api/settings/company", {
        method: "PUT",
        cookie: dirCookie,
        body: updateData,
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe("Công ty Cổ phần Cơ khí Xây dựng An Phát");
    expect(json.data.shortName).toBe("An Phát");
    expect(json.data.taxId).toBe("0101234567-001");
  });
});
