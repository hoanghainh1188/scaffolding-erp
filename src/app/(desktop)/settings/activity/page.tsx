import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import {
  ActivityFilters,
  ExportButton,
} from "@/components/activity/activity-filters";
import { ActivityTable } from "@/components/activity/activity-table";
import { rangeText } from "@/components/activity/format";
import { getDatabase } from "@/db/client";
import {
  defaultRange,
  filterParams,
  parseActivityFilter,
} from "@/domain/activity-filter";
import { toBusinessDate } from "@/domain/business-date";
import { activityOverview, activityPeople } from "@/lib/activity/queries";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Nhật ký thao tác" };

type Search = Promise<Record<string, string | string[] | undefined>>;

function Tile({
  title,
  value,
  note,
  warning,
}: {
  title: string;
  value: number;
  note: string;
  warning?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-4">
      <span className="text-caption font-semibold text-muted-foreground">
        {title}
      </span>
      <span
        className={
          warning
            ? "font-display text-h2 text-warning tabular-nums"
            : "font-display text-h2 tabular-nums"
        }
      >
        {value.toLocaleString("vi-VN")}
      </span>
      <span className="text-sm text-muted-foreground">{note}</span>
    </div>
  );
}

/** D18 Nhật ký thao tác (spec activity-log); director only. */
export default async function Page({ searchParams }: { searchParams: Search }) {
  await requirePermission("activity.view");
  await connection();
  const today = toBusinessDate(new Date());
  const raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const parsed = parseActivityFilter(params, today);
  const db = getDatabase();
  const people = await activityPeople(db);
  const range = defaultRange(today);
  const filter = parsed.ok
    ? parsed.filter
    : {
        ...range,
        userId: params.user ?? null,
        type: null,
        code: params.code ?? null,
        group: null,
        review: false,
      };
  const overview = parsed.ok ? await activityOverview(db, parsed.filter) : null;
  const query = filterParams(filter, today).toString();
  const search = query ? `?${query}` : "";

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/settings" className="hover:underline">
          Cài đặt
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Nhật ký thao tác</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Nhật ký thao tác</h1>
          <p className="text-body text-muted-foreground">
            Ai làm gì, lúc nào, với chứng từ nào. Chỉ ghi thêm: không ai sửa hay
            xóa được, kể cả Giám đốc.
          </p>
        </div>
        {overview ? <ExportButton query={search} /> : null}
      </div>

      {overview ? (
        <section
          aria-label="Tóm tắt"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <Tile
            title="Thao tác"
            value={overview.summary.total}
            note={`${rangeText(filter.from, filter.to)} · ${overview.summary.people} người · ${overview.summary.mobile} trên điện thoại`}
          />
          <Tile
            title="Duyệt, ghi sổ"
            value={overview.summary.approvals}
            note="đã đổi sổ kho"
          />
          <Tile
            title="Sửa, xóa, trả lại"
            value={overview.summary.edits}
            note="xem kỹ nếu không có lý do"
          />
          <Tile
            title="Cần xem kỹ"
            value={overview.summary.review}
            note="ngoài giờ · dữ liệu nhạy cảm · bất thường"
            warning
          />
        </section>
      ) : null}

      <ActivityFilters
        key={`filters${search}`}
        values={filter}
        people={people}
        reviewCount={overview?.reviewCount ?? 0}
      />

      {overview ? (
        <ActivityTable
          key={`table${search}`}
          rows={overview.rows}
          days={overview.days}
          total={overview.total}
          nextCursor={overview.nextCursor}
          query={search}
        />
      ) : (
        <p
          role="alert"
          className="rounded-lg border bg-card p-5 text-sm text-destructive"
        >
          {parsed.ok ? "" : parsed.error}
        </p>
      )}

      <p className="flex gap-2.5 rounded-md bg-accent p-4 text-sm text-accent-foreground">
        <ShieldCheck aria-hidden className="size-5 shrink-0" />
        Số tài khoản, CCCD chỉ hiện 4 số cuối. &quot;Ngoài giờ&quot; là thao tác
        trước 06:00 hoặc sau 21:00.
      </p>
    </div>
  );
}
