// Reading and exporting the activity log (activity-log tasks 6.1, 6.2).
import { inflateRawSync } from "node:zlib";

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  parseActivityFilter,
  type ActivityFilter,
} from "@/domain/activity-filter";
import type { BusinessDate } from "@/domain/business-date";
import {
  createTestContext,
  createTestUser,
  resetAuthTables,
  type TestUser,
} from "@/test/auth";

import { systemActor } from "./actor";
import { logActivity, type ActivityEntry } from "./log";
import { activityOverview, exportActivity, listActivity } from "./queries";

const ctx = createTestContext();
afterAll(ctx.close);

const TODAY = "2026-10-28" as BusinessDate;
let thuha: TestUser;
let vantung: TestUser;

beforeEach(async () => {
  await resetAuthTables();
  thuha = await createTestUser(ctx, {
    role: "ACCOUNTANT",
    username: "thuha",
    name: "Thu Hà",
  });
  vantung = await createTestUser(ctx, {
    role: "WAREHOUSE",
    username: "vantung",
    name: "Văn Tùng",
  });
});

function filter(params: Record<string, string> = {}): ActivityFilter {
  const parsed = parseActivityFilter(
    { from: "2026-10-27", to: "2026-10-28", ...params },
    TODAY,
  );
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.filter;
}

async function log(
  who: TestUser,
  vn: string,
  entry: Partial<ActivityEntry> & { code?: string },
  device: "DESKTOP" | "MOBILE" = "DESKTOP",
) {
  const { code = "PO-2026-055", ...rest } = entry;
  await ctx.db.transaction((tx) =>
    logActivity(
      tx,
      systemActor(who, { device, browser: "EDGE" }),
      {
        action: "UPDATE",
        document: { type: "PURCHASE_ORDER", id: code, code },
        summary: "x",
        ...rest,
      },
      { now: new Date(`${vn}+07:00`) },
    ),
  );
}

/** A small D18 day: 6 rows over 27–28/10 plus one outside the range. */
async function sample() {
  await log(thuha, "2026-10-26T10:00:00", { action: "CREATE" });
  await log(thuha, "2026-10-27T17:20:00", { action: "CREATE" });
  await log(thuha, "2026-10-27T23:05:00", {
    code: "NCC-0004",
    document: { type: "SUPPLIER", id: "s", code: "NCC-0004" },
    sensitive: true,
  });
  await log(
    vantung,
    "2026-10-28T07:41:00",
    { action: "SIGN_IN", document: undefined, summary: "Đăng nhập thành công" },
    "MOBILE",
  );
  await log(
    vantung,
    "2026-10-28T08:00:00",
    {
      action: "CREATE",
      code: "KK-2026-003",
      document: { type: "STOCKTAKE", id: "k", code: "KK-2026-003" },
    },
    "MOBILE",
  );
  await log(
    vantung,
    "2026-10-28T15:40:00",
    {
      action: "POST",
      code: "PN-2026-093",
      document: { type: "GOODS_RECEIPT", id: "p", code: "PN-2026-093" },
      anomaly: true,
    },
    "MOBILE",
  );
  await log(thuha, "2026-10-28T22:47:13", {});
}

describe("activityOverview", () => {
  it("counts the four tiles and the days of the filter", async () => {
    await sample();
    const overview = await activityOverview(ctx.db, filter());
    expect(overview.summary).toEqual({
      total: 6,
      people: 2,
      mobile: 3,
      approvals: 1,
      edits: 2,
      review: 3,
    });
    expect(overview.reviewCount).toBe(3);
    expect(overview.days).toEqual([
      { date: "2026-10-28", count: 4 },
      { date: "2026-10-27", count: 2 },
    ]);
    expect(overview.rows.map((row) => row.at)).toEqual([
      "2026-10-28T15:47:13.000Z",
      "2026-10-28T08:40:00.000Z",
      "2026-10-28T01:00:00.000Z",
      "2026-10-28T00:41:00.000Z",
      "2026-10-27T16:05:00.000Z",
      "2026-10-27T10:20:00.000Z",
    ]);
    expect(overview.rows[0]).toMatchObject({
      userName: "Thu Hà",
      username: "thuha",
    });
  });

  it("filters by person, type, code, group and review", async () => {
    await sample();
    const codes = async (params: Record<string, string>) =>
      (await activityOverview(ctx.db, filter(params))).rows.map(
        (row) => row.documentCode,
      );
    expect(await codes({ user: vantung.id })).toEqual([
      "PN-2026-093",
      "KK-2026-003",
      null,
    ]);
    expect(await codes({ type: "SUPPLIER" })).toEqual(["NCC-0004"]);
    expect(await codes({ code: "kk-2026-003" })).toEqual(["KK-2026-003"]);
    expect(await codes({ group: "SIGN_IN" })).toEqual([null]);
    expect(await codes({ group: "APPROVAL" })).toEqual(["PN-2026-093"]);
    expect(await codes({ review: "1" })).toEqual([
      "PO-2026-055",
      "PN-2026-093",
      "NCC-0004",
    ]);
    const reviewing = await activityOverview(ctx.db, filter({ review: "1" }));
    expect(reviewing.summary.total).toBe(3);
    expect(reviewing.reviewCount).toBe(3);
  });

  it("puts rows in Vietnam days at the 23:59:59 / 00:00:00 edge", async () => {
    await log(thuha, "2026-10-27T23:59:59", {});
    await log(thuha, "2026-10-28T00:00:00", {});
    // 23:30 UTC on 27/10 is 06:30 on 28/10 in Vietnam.
    await ctx.db.transaction((tx) =>
      logActivity(
        tx,
        thuha,
        {
          action: "UPDATE",
          document: { type: "ITEM", id: "i", code: "GG-K17" },
          summary: "x",
        },
        { now: new Date("2026-10-27T23:30:00Z") },
      ),
    );
    const overview = await activityOverview(ctx.db, filter());
    expect(overview.days).toEqual([
      { date: "2026-10-28", count: 2 },
      { date: "2026-10-27", count: 1 },
    ]);
    const only27 = await activityOverview(
      ctx.db,
      filter({ from: "2026-10-27", to: "2026-10-27" }),
    );
    expect(only27.rows.map((row) => row.at)).toEqual([
      "2026-10-27T16:59:59.000Z",
    ]);
    const only28 = await activityOverview(
      ctx.db,
      filter({ from: "2026-10-28", to: "2026-10-28" }),
    );
    expect(only28.summary.total).toBe(2);
  });

  it("is empty for someone who did nothing", async () => {
    await sample();
    const nobody = await createTestUser(ctx, {
      role: "WORKSHOP",
      username: "xuong",
    });
    const overview = await activityOverview(
      ctx.db,
      filter({ user: nobody.id }),
    );
    expect(overview).toMatchObject({
      rows: [],
      total: 0,
      nextCursor: null,
      days: [],
      summary: { total: 0, people: 0, review: 0 },
    });
  });
});

describe("listActivity: Xem thêm by cursor", () => {
  it("never repeats nor skips, even with rows written meanwhile", async () => {
    await ctx.db.transaction(async (tx) => {
      for (let i = 0; i < 120; i += 1) {
        // Some share a second: the id breaks the tie.
        const second = String(Math.floor(i / 2) % 60).padStart(2, "0");
        const minute = String(Math.floor((i / 120) * 60)).padStart(2, "0");
        await logActivity(
          tx,
          thuha,
          {
            action: "UPDATE",
            document: { type: "ITEM", id: `i${i}`, code: `GG-${i}` },
            summary: "x",
          },
          { now: new Date(`2026-10-28T10:${minute}:${second}+07:00`) },
        );
      }
    });
    const first = await activityOverview(ctx.db, filter());
    expect(first.rows).toHaveLength(50);
    expect(first.total).toBe(120);
    await log(thuha, "2026-10-28T23:00:00", { code: "NEW-1" });
    await log(thuha, "2026-10-28T23:01:00", { code: "NEW-2" });
    const second = await listActivity(ctx.db, filter(), first.nextCursor);
    const third = await listActivity(ctx.db, filter(), second.nextCursor);
    expect(second.rows).toHaveLength(50);
    expect(third.rows).toHaveLength(20);
    expect(third.nextCursor).toBeNull();
    expect(second.total).toBe(120);
    const ids = [...first.rows, ...second.rows, ...third.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(120);
    expect(
      ids.some((id) => id > Math.max(...first.rows.map((r) => r.id))),
    ).toBe(false);
    // A fresh load shows the two new rows.
    const reloaded = await activityOverview(ctx.db, filter());
    expect(reloaded.total).toBe(122);
  });

  it("ignores a cursor it did not write", async () => {
    await sample();
    const page = await listActivity(ctx.db, filter(), "not-a-cursor");
    expect(page.rows).toHaveLength(6);
  });
});

/** sheet1.xml of an exported workbook. */
function sheetOf(file: Uint8Array): string {
  const buffer = Buffer.from(file);
  const name = Buffer.from("xl/worksheets/sheet1.xml");
  let at = 0;
  while (
    (at = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), at)) >= 0
  ) {
    const size = buffer.readUInt32LE(at + 18);
    const nameLength = buffer.readUInt16LE(at + 26);
    const start = at + 30 + nameLength;
    if (buffer.subarray(at + 30, start).equals(name)) {
      return inflateRawSync(buffer.subarray(start, start + size)).toString();
    }
    at = start + size;
  }
  return "";
}

describe("exportActivity", () => {
  it("exports every row of the filter with masked numbers and flags", async () => {
    await ctx.db.transaction(async (tx) => {
      for (let i = 0; i < 195; i += 1) {
        await logActivity(
          tx,
          thuha,
          {
            action: "CREATE",
            document: { type: "ITEM", id: `i${i}`, code: `GG-${i}` },
            summary: "x",
          },
          { now: new Date("2026-10-27T10:00:00+07:00") },
        );
      }
      await logActivity(
        tx,
        thuha,
        {
          action: "UPDATE",
          document: { type: "SUPPLIER", id: "s", code: "NCC-0004" },
          summary: "Số tài khoản: •••• 1234 → •••• 5678",
          changes: [
            {
              field: "bankAccount",
              label: "Số tài khoản",
              before: "•••• 1234",
              after: "•••• 5678",
            },
          ],
          sensitive: true,
        },
        { now: new Date("2026-10-27T23:05:00+07:00") },
      );
    });
    const result = await exportActivity(ctx.db, filter());
    if (!result.ok) throw new Error(result.error);
    expect(result.filename).toBe("nhat-ky-2026-10-27-2026-10-28.xlsx");
    expect(result.rows).toBe(196);
    const sheet = sheetOf(result.file);
    expect(sheet.match(/<row /g)).toHaveLength(197);
    expect(sheet).toContain("Số tài khoản: •••• 1234 → •••• 5678");
    expect(sheet).toContain("Ngoài giờ, Dữ liệu nhạy cảm");
    expect(sheet).toContain("27/10/2026 23:05:00");
  });

  it("exports exactly 10.000 rows and refuses 10.001", async () => {
    const insert = async (count: number) => {
      await ctx.db.execute(
        // Fast bulk rows; the table only refuses UPDATE and DELETE.
        sql`
          insert into activity_log (created_at, user_id, role, device, browser, action, document_type, document_code, summary)
          select timestamptz '2026-10-28 10:00:00+07' + (n || ' ms')::interval, ${thuha.id}, 'ACCOUNTANT', 'DESKTOP', 'EDGE', 'CREATE', 'ITEM', 'GG-' || n, 'x'
          from generate_series(1, ${count}) as n`,
      );
    };
    await insert(10_000);
    const ok = await exportActivity(ctx.db, filter());
    expect(ok.ok && ok.rows).toBe(10_000);
    await insert(1);
    expect(await exportActivity(ctx.db, filter())).toEqual({
      ok: false,
      status: 422,
      error:
        "Có 10.001 thao tác, quá 10.000 dòng. Thu hẹp khoảng ngày hoặc bộ lọc",
    });
  });
});
