// "Ngày nghỉ không tính thuê trong kỳ" of D7 (0.2 #73).
import Link from "next/link";

import { formatBusinessDate } from "@/domain/business-date";
import type { PeriodHoliday } from "@/lib/billing/queries";

const range = (holiday: PeriodHoliday) =>
  holiday.startDate === holiday.endDate
    ? formatBusinessDate(holiday.startDate)
    : `${formatBusinessDate(holiday.startDate).slice(0, 5)} – ${formatBusinessDate(holiday.endDate)}`;

export function HolidayBand({
  holidays,
  canEdit,
}: {
  holidays: readonly PeriodHoliday[];
  canEdit: boolean;
}) {
  return (
    <section
      aria-label="Ngày nghỉ không tính thuê trong kỳ"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning bg-card px-4 py-3 text-sm"
    >
      <p>
        <span className="font-medium">
          Ngày nghỉ không tính thuê trong kỳ:{" "}
        </span>
        {holidays.length === 0
          ? "Không có"
          : holidays
              .map(
                (holiday) =>
                  `${holiday.name} ${range(holiday)} (${holiday.days} ngày)`,
              )
              .join("; ")}
      </p>
      {canEdit ? (
        <Link
          href="/settings/holidays"
          className="text-primary hover:underline"
        >
          Sửa ở Cài đặt → Ngày nghỉ
        </Link>
      ) : null}
    </section>
  );
}
