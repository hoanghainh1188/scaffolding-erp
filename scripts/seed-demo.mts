// Sample data for demonstration environment (spec K9).
// Can run in production only when DEMO_MODE=true.
// Shifts transaction dates relative to current run time in Asia/Ho_Chi_Minh.
//   npm run db:seed:demo
import { fileURLToPath } from "node:url";

import { createDatabase } from "@/db/client";
import {
  type BusinessDate,
  addDays,
  daysBetween,
  toBusinessDate,
} from "@/domain/business-date";
import { actorByUsername } from "@/lib/activity/actor";
import { seedActivity } from "@/lib/activity/sample";
import { createAuth } from "@/lib/auth/auth";
import { seedContracts } from "@/lib/contracts/sample";
import { seedDeliveries } from "@/lib/deliveries/sample";
import { getEnv, isDemoMode } from "@/lib/env";
import { seedCatalog } from "@/lib/catalog/seed";
import { seedHolidays } from "@/lib/holidays/sample";
import { seedValueAdjustments } from "@/lib/inventory/revaluation-sample";
import { seedInventory } from "@/lib/inventory/sample";
import { seedPurchasing } from "@/lib/purchasing/sample";
import { seedPayables } from "@/lib/payables/sample";
import { seedReceivables } from "@/lib/receivables/sample";
import { SAMPLE_RECEIVING_AT, seedReceiving } from "@/lib/receiving/sample";
import { seedRepairs } from "@/lib/repairs/sample";
import { seedWorkOrders } from "@/lib/repairs/work-sample";
import { seedReturns } from "@/lib/returns/sample";
import { seedSiteOperations } from "@/lib/site-transfers/sample";
import { seedStocktakes } from "@/lib/stocktakes/sample";
import { DEV_ACCOUNTS, seedAccounts } from "@/lib/users/seed";

export const BASE_DEMO_DATE = "2026-10-28" as BusinessDate;

export interface RunCheckEnv {
  NODE_ENV?: string;
  DEMO_MODE?: boolean;
}

export function canRunDemoSeed(
  env: RunCheckEnv,
): { ok: true } | { ok: false; reason: string } {
  if (env.NODE_ENV === "production" && !env.DEMO_MODE) {
    return {
      ok: false,
      reason: "db:seed:demo từ chối chạy ở production khi DEMO_MODE tắt.\n",
    };
  }
  return { ok: true };
}

export function computeDateOffset(
  runDate: Date,
  baseDate: BusinessDate = BASE_DEMO_DATE,
): number {
  const today = toBusinessDate(runDate);
  return daysBetween(baseDate, today);
}

export function shiftDate(
  dateStr: BusinessDate,
  offsetDays: number,
): BusinessDate {
  return addDays(dateStr, offsetDays);
}

export function shiftInstant(instant: Date, offsetDays: number): Date {
  return new Date(instant.getTime() + offsetDays * 86_400_000);
}

export async function runDemoSeed(now: Date = new Date()): Promise<number> {
  const check = canRunDemoSeed({
    NODE_ENV: process.env.NODE_ENV,
    DEMO_MODE: isDemoMode(),
  });
  if (!check.ok) {
    process.stderr.write(check.reason);
    return 1;
  }

  const env = getEnv();
  const seedPassword = env.DEV_SEED_PASSWORD || "demo123456";
  const handle = createDatabase(env.DATABASE_URL);

  try {
    const auth = createAuth({
      db: handle.db,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
    });

    const offsetDays = computeDateOffset(now, BASE_DEMO_DATE);
    const receivingAt = shiftInstant(SAMPLE_RECEIVING_AT, offsetDays);

    const created = await seedAccounts({ db: handle.db, auth }, DEV_ACCOUNTS, {
      password: seedPassword,
    });
    const names = DEV_ACCOUNTS.map((entry) => entry.username).join(", ");
    const director = await actorByUsername(handle.db, "giamdoc");
    const catalogRows = director ? await seedCatalog(handle.db, director) : 0;
    process.stdout.write(`Danh mục mẫu: thêm ${catalogRows} bản ghi.\n`);

    const ledgerRows = director ? await seedInventory(handle.db, director) : 0;
    process.stdout.write(`Sổ kho mẫu: thêm ${ledgerRows} dòng.\n`);

    const orders = director
      ? await seedPurchasing(handle.db, director, now)
      : 0;
    process.stdout.write(`Đơn thu mua mẫu: thêm ${orders} đơn.\n`);

    const warehouse = await actorByUsername(handle.db, "thukho");
    const receipts =
      director && warehouse
        ? await seedReceiving(handle.db, { director, warehouse }, receivingAt)
        : 0;
    process.stdout.write(`Phiếu nhập mẫu: thêm ${receipts} phiếu.\n`);

    const accountant = await actorByUsername(handle.db, "ketoan");
    const repairs = accountant
      ? await seedRepairs(handle.db, accountant, now)
      : 0;
    process.stdout.write(`Phiếu sửa chữa mẫu: thêm ${repairs} phiếu.\n`);

    const stocktakes = warehouse
      ? await seedStocktakes(handle.db, warehouse)
      : 0;
    process.stdout.write(`Phiên kiểm kê mẫu: thêm ${stocktakes} phiên.\n`);

    const revaluations = accountant
      ? await seedValueAdjustments(handle.db, accountant)
      : 0;
    process.stdout.write(
      `Phiếu điều chỉnh giá mẫu: thêm ${revaluations} phiếu.\n`,
    );

    // The same contracts and the documents hanging off them as db:seed:dev
    // (contracts → deliveries → returns → site operations → receipts), so
    // the demo shows D1 and the screens after it filled, not empty.
    const sales = await actorByUsername(handle.db, "kinhdoanh");
    const contracts =
      director && sales
        ? await seedContracts(handle.db, { director, sales })
        : 0;
    process.stdout.write(`Hợp đồng mẫu: thêm ${contracts} hợp đồng.\n`);

    const deliveries =
      sales && warehouse
        ? await seedDeliveries(handle.db, { sales, warehouse })
        : 0;
    process.stdout.write(`Phiếu xuất mẫu: thêm ${deliveries} phiếu.\n`);

    const returns = warehouse ? await seedReturns(handle.db, { warehouse }) : 0;
    process.stdout.write(`Phiếu thu hồi mẫu: thêm ${returns} phiếu.\n`);

    const siteOperations =
      director && sales
        ? await seedSiteOperations(handle.db, { director, sales })
        : 0;
    process.stdout.write(
      `Chuyển công trình, mua lại, đổi hàng mẫu: thêm ${siteOperations} chứng từ.\n`,
    );

    const holidays = director ? await seedHolidays(handle.db, director) : 0;
    process.stdout.write(`Ngày nghỉ không tính thuê: thêm ${holidays} dòng.\n`);

    const moneyIn = accountant
      ? await seedReceivables(handle.db, accountant)
      : 0;
    process.stdout.write(`Phiếu thu mẫu: thêm ${moneyIn} phiếu.\n`);
    // Sample supplier terms and payment (payables 8.1).
    const moneyOut = accountant ? await seedPayables(handle.db, accountant) : 0;
    process.stdout.write(`Phải trả mẫu: thêm ${moneyOut} dòng.\n`);
    // Sample work order counted like drawing D12 (repair-work-orders 9.1).
    const workshopUser = await actorByUsername(handle.db, "xuong");
    const workOrders =
      director && accountant && warehouse && workshopUser
        ? await seedWorkOrders(handle.db, {
            director,
            accountant,
            warehouse,
            workshop: workshopUser,
          })
        : 0;
    process.stdout.write(
      `Vật tư phụ và lệnh sửa mẫu: thêm ${workOrders} bản ghi.\n`,
    );

    const activity =
      director && accountant && sales && warehouse
        ? await seedActivity(handle.db, {
            director,
            accountant,
            sales,
            warehouse,
          })
        : 0;
    process.stdout.write(`Nhật ký mẫu: thêm ${activity} dòng.\n`);
    process.stdout.write(
      created.length > 0
        ? `Đã tạo ${created.length} tài khoản: ${created.join(", ")}.\n`
        : `Đã có đủ tài khoản mẫu: ${names}.\n`,
    );
    return 0;
  } finally {
    await handle.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDemoSeed().then(
    (code) => process.exit(code),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Seed demo thất bại: ${message}\n`);
      process.exit(1);
    },
  );
}
