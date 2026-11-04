// Sample holidays of 2027 for dev (rental-billing task 7.1, design D14):
// Tết Dương lịch, Tết Nguyên đán like drawing D7, Giỗ Tổ, 30/4 – 1/5 and
// 2/9. Created through the service, only while 2027 has none.
import type { Database } from "@/db/client";
import type { ActivityActor } from "@/lib/activity/actor";

import { holidaysOfYear } from "./queries";
import { createHoliday } from "./service";

const HOLIDAYS_2027 = [
  { name: "Tết Dương lịch", startDate: "2027-01-01", endDate: "2027-01-01" },
  { name: "Tết Nguyên đán", startDate: "2027-02-05", endDate: "2027-02-13" },
  { name: "Giỗ Tổ Hùng Vương", startDate: "2027-04-16", endDate: "2027-04-16" },
  {
    name: "Giải phóng miền Nam, Quốc tế lao động",
    startDate: "2027-04-30",
    endDate: "2027-05-01",
  },
  { name: "Quốc khánh", startDate: "2027-09-02", endDate: "2027-09-03" },
];

/** Number of holidays added. */
export async function seedHolidays(
  db: Database,
  director: ActivityActor,
): Promise<number> {
  if ((await holidaysOfYear(db, 2027)).length > 0) return 0;
  let added = 0;
  for (const holiday of HOLIDAYS_2027) {
    const saved = await createHoliday(db, director, holiday);
    if (!saved.ok) throw new Error(saved.error);
    added += 1;
  }
  return added;
}
