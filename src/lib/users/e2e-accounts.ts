import type { Role } from "@/domain/role";

import type { SeedAccount } from "./seed";

/** Accounts the Playwright setup signs in as, one per role. */
export const E2E_ACCOUNTS: readonly (SeedAccount & { role: Role })[] = [
  { username: "e2e.giamdoc", name: "Minh Anh", role: "DIRECTOR" },
  { username: "e2e.ketoan", name: "Thu Hà", role: "ACCOUNTANT" },
  { username: "e2e.kinhdoanh", name: "Quốc Bảo", role: "SALES" },
  { username: "e2e.thukho", name: "Văn Tùng", role: "WAREHOUSE" },
  { username: "e2e.xuong", name: "Hoàng Nam", role: "WORKSHOP" },
];

/** Prefix of throwaway accounts that E2E tests create; removed each run. */
export const E2E_TEMP_PREFIX = "e2etmp";
