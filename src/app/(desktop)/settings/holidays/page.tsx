import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { HolidayManager } from "@/components/settings/holiday-manager";
import { getDatabase } from "@/db/client";
import { holidayLength } from "@/domain/rental-holiday";
import { requirePermission } from "@/lib/auth/guard";
import { holidaysOfYear, latestClosedPeriod } from "@/lib/holidays/queries";

export const metadata: Metadata = { title: "Ngày nghỉ không tính thuê" };

/** Spec rental-holidays "Màn ngày nghỉ trong Cài đặt"; director only. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requirePermission("holidays.manage");
  await connection();
  const query = await searchParams;
  const current = new Date().getFullYear();
  const picked = Number(query.year);
  const year =
    Number.isInteger(picked) && picked >= 2000 && picked <= 2100
      ? picked
      : current;
  const db = getDatabase();
  const [rows, closed] = await Promise.all([
    holidaysOfYear(db, year),
    latestClosedPeriod(db),
  ]);
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/settings" className="hover:underline">
          Cài đặt
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Ngày nghỉ không tính thuê</span>
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Ngày nghỉ không tính thuê</h1>
        <p className="text-body text-muted-foreground">
          Những ngày này không tính tiền thuê cho mọi hợp đồng thuê (VD Tết,
          lễ). Ngày nghỉ nằm trong kỳ đã chốt thì không đổi được nữa.
        </p>
      </div>
      <HolidayManager
        year={year}
        rows={rows.map((row) => ({
          id: row.id,
          name: row.name,
          startDate: row.startDate,
          endDate: row.endDate,
          days: holidayLength(row),
          updatedAt: row.updatedAt.toISOString(),
          locked: closed !== null && row.startDate <= closed.periodEnd,
        }))}
        lockReason={
          closed
            ? `Đã có kỳ chốt đến ${closed.periodEnd.split("-").reverse().join("/")} nên ngày nghỉ trước ngày đó không đổi được.`
            : null
        }
      />
    </div>
  );
}
