// Sample activity like drawing D18 (activity-log design D13): 11 rows on
// 27–28/10/2026 for the sample accounts, written once, through logActivity
// at fixed times. Dev seed and E2E global setup only; the codes are sample
// documents, not a record of real work.
import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { activityLog } from "@/db/schema";

import type { ActivityActor } from "./actor";
import { logActivity, type ActivityEntry } from "./log";

export interface SampleActors {
  director: ActivityActor;
  accountant: ActivityActor;
  sales: ActivityActor;
  warehouse: ActivityActor;
}

const vn = (clock: string) => new Date(`2026-10-${clock}+07:00`);

/** The first sample row: its presence means the sample is already there. */
const MARKER = {
  at: vn("28T08:00:00"),
  summary: "Bắt đầu kiểm kê BAI-01 · 28 dòng",
};

type Sample = [
  who: keyof SampleActors,
  at: Date,
  device: "DESKTOP" | "MOBILE",
  entry: ActivityEntry,
];

function samples(): Sample[] {
  const po = {
    type: "PURCHASE_ORDER" as const,
    id: "sample-po-055",
    code: "PO-2026-055",
  };
  const kk = {
    type: "STOCKTAKE" as const,
    id: "sample-kk-003",
    code: "KK-2026-003",
  };
  return [
    [
      "accountant",
      vn("27T17:20:00"),
      "DESKTOP",
      {
        action: "CREATE",
        document: po,
        summary: "Hòa Phát mẫu · 5 mã hàng · 52.942.500 ₫",
      },
    ],
    [
      "sales",
      vn("27T23:05:00"),
      "DESKTOP",
      {
        action: "UPDATE",
        document: { type: "SUPPLIER", id: "sample-ncc-0004", code: "NCC-0004" },
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
    ],
    [
      "warehouse",
      vn("28T07:41:00"),
      "MOBILE",
      { action: "SIGN_IN", summary: "Đăng nhập thành công" },
    ],
    [
      "warehouse",
      MARKER.at,
      "MOBILE",
      { action: "CREATE", document: kk, summary: MARKER.summary },
    ],
    [
      "director",
      vn("28T09:30:00"),
      "DESKTOP",
      {
        action: "RETURN",
        document: {
          type: "STOCK_ADJUSTMENT",
          id: "sample-dc-005",
          code: "ĐC-2026-005",
        },
        summary: 'Lý do: "Ghi rõ số phiếu thu hồi"',
      },
    ],
    [
      "accountant",
      vn("28T10:02:00"),
      "DESKTOP",
      {
        action: "DELETE_DRAFT",
        document: {
          type: "REPAIR_ORDER",
          id: "sample-psc-025",
          code: "PSC-2026-025",
        },
        summary: "Nháp có 2 mã hàng, chưa ghi sổ",
      },
    ],
    [
      "warehouse",
      vn("28T11:40:00"),
      "MOBILE",
      { action: "SUBMIT", document: kk, summary: "Gửi văn phòng 28 / 28 dòng" },
    ],
    [
      "accountant",
      vn("28T14:12:00"),
      "DESKTOP",
      {
        action: "POST",
        document: {
          type: "REPAIR_ORDER",
          id: "sample-psc-024",
          code: "PSC-2026-024",
        },
        summary: "56 cái về Tốt, 4 phế liệu · chi phí 2.220.000 ₫",
      },
    ],
    [
      "warehouse",
      vn("28T15:40:00"),
      "MOBILE",
      {
        action: "POST",
        document: {
          type: "GOODS_RECEIPT",
          id: "sample-pn-093",
          code: "PN-2026-093",
        },
        summary:
          "Nhận 80 cái GG-K17, 50 cái PK-KU từ PO-2026-052 · đã xác nhận nhận dư GG-K17 80/60 cái",
        anomaly: true,
      },
    ],
    [
      "director",
      vn("28T16:05:00"),
      "DESKTOP",
      {
        action: "APPROVE",
        document: kk,
        summary: "Ghi sổ 5 dòng điều chỉnh · −2.788.056 ₫",
      },
    ],
    [
      "accountant",
      vn("28T22:47:13"),
      "DESKTOP",
      {
        action: "UPDATE",
        document: po,
        summary: "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫",
        changes: [
          {
            field: "lines.GG-K17.unitPrice",
            label: "Đơn giá GG-K17",
            before: "190.000 ₫",
            after: "185.000 ₫",
          },
          {
            field: "goodsTotal",
            label: "Tổng tiền hàng của đơn",
            before: "52.942.500 ₫",
            after: "51.942.500 ₫",
          },
        ],
      },
    ],
  ];
}

/** Writes the D18 sample once; returns how many rows it added. */
export async function seedActivity(
  db: Database,
  actors: SampleActors,
): Promise<number> {
  const [done] = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.userId, actors.warehouse.id),
        eq(activityLog.createdAt, MARKER.at),
        eq(activityLog.summary, MARKER.summary),
      ),
    )
    .limit(1);
  if (done) return 0;
  const rows = samples();
  await db.transaction(async (tx) => {
    for (const [who, at, device, entry] of rows) {
      const browser = device === "MOBILE" ? "CHROME" : "EDGE";
      await logActivity(tx, { ...actors[who], device, browser }, entry, {
        now: at,
      });
    }
  });
  return rows.length;
}
