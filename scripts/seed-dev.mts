// Sample accounts for local development, one per role, all with the
// password in DEV_SEED_PASSWORD. Safe to run again. Never in production.
//   npm run db:seed:dev
import { createDatabase } from "@/db/client";
import { actorByUsername } from "@/lib/activity/actor";
import { seedActivity } from "@/lib/activity/sample";
import { createAuth } from "@/lib/auth/auth";
import { getEnv } from "@/lib/env";
import { seedCatalog } from "@/lib/catalog/seed";
import { seedInventory } from "@/lib/inventory/sample";
import { seedPurchasing } from "@/lib/purchasing/sample";
import { seedReceiving } from "@/lib/receiving/sample";
import { seedRepairs } from "@/lib/repairs/sample";
import { seedStocktakes } from "@/lib/stocktakes/sample";
import { DEV_ACCOUNTS, seedAccounts } from "@/lib/users/seed";

async function main(): Promise<number> {
  // Checked before anything else reads the configuration.
  if (process.env.NODE_ENV === "production") {
    process.stderr.write("db:seed:dev không chạy ở production.\n");
    return 1;
  }
  const env = getEnv();
  if (!env.DEV_SEED_PASSWORD) {
    process.stderr.write(
      "Thiếu DEV_SEED_PASSWORD trong .env (xem .env.example).\n",
    );
    return 1;
  }
  const handle = createDatabase(env.DATABASE_URL);
  try {
    const auth = createAuth({
      db: handle.db,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
    });
    const created = await seedAccounts({ db: handle.db, auth }, DEV_ACCOUNTS, {
      password: env.DEV_SEED_PASSWORD,
    });
    const names = DEV_ACCOUNTS.map((entry) => entry.username).join(", ");
    const director = await actorByUsername(handle.db, "giamdoc");
    const catalogRows = director ? await seedCatalog(handle.db, director) : 0;
    process.stdout.write(`Danh mục mẫu: thêm ${catalogRows} bản ghi.\n`);
    // Sample stock: the worked example of inventory-ledger design D11.
    const ledgerRows = director ? await seedInventory(handle.db, director) : 0;
    process.stdout.write(`Sổ kho mẫu: thêm ${ledgerRows} dòng.\n`);
    // Sample orders: the D3 order of purchase-orders design D3 and others.
    const orders = director ? await seedPurchasing(handle.db, director) : 0;
    process.stdout.write(`Đơn thu mua mẫu: thêm ${orders} đơn.\n`);
    // Sample receipts: an order receiving like D3b (goods-receipt D14).
    const warehouse = await actorByUsername(handle.db, "thukho");
    const receipts =
      director && warehouse
        ? await seedReceiving(handle.db, { director, warehouse })
        : 0;
    process.stdout.write(`Phiếu nhập mẫu: thêm ${receipts} phiếu.\n`);
    // Sample repair slip: a draft like drawing D12 (simple-repair D13).
    const accountant = await actorByUsername(handle.db, "ketoan");
    const repairs = accountant ? await seedRepairs(handle.db, accountant) : 0;
    process.stdout.write(`Phiếu sửa chữa mẫu: thêm ${repairs} phiếu.\n`);
    // Sample stocktake: a session waiting for approval like D13 (stocktake D16).
    const stocktakes = warehouse
      ? await seedStocktakes(handle.db, warehouse)
      : 0;
    process.stdout.write(`Phiên kiểm kê mẫu: thêm ${stocktakes} phiên.\n`);
    // Sample activity log like drawing D18 (activity-log design D13).
    const sales = await actorByUsername(handle.db, "kinhdoanh");
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

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Seed thất bại: ${message}\n`);
    process.exit(1);
  },
);
