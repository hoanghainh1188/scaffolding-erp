import type { Metadata } from "next";
import { connection } from "next/server";

import { DeliveryHome } from "@/components/delivery-picking/delivery-home";
import { DraftBanner } from "@/components/drafts/draft-banner";
import { ArrivalList } from "@/components/receiving/arrival-list";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { StocktakeHome } from "@/components/stocktake/stocktake-home";
import { getDatabase } from "@/db/client";
import {
  BUSINESS_TIME_ZONE,
  formatBusinessDate,
  toBusinessDate,
} from "@/domain/business-date";
import { can } from "@/domain/permissions";
import { requireUser } from "@/lib/auth/guard";
import { mobileTasks, type MobileTask } from "@/lib/deliveries/queries";
import { arrivals, type Arrivals } from "@/lib/receiving/queries";
import { openStocktakes, type OpenStocktake } from "@/lib/stocktakes/queries";

export const metadata: Metadata = { title: "Việc hôm nay" };

const weekday = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  timeZone: BUSINESS_TIME_ZONE,
});

type Search = Promise<Record<string, string | string[] | undefined>>;

/** "Văn Tùng" → "Tùng": people are called by their given name. */
const givenName = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;

/** M1 (spec mobile-home). Later changes add their own blocks here. */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  await connection();
  const now = new Date();
  const today = toBusinessDate(now);
  const { later } = await searchParams;
  const work: Arrivals | null = can(user.role, "receiving.manage")
    ? await arrivals(getDatabase(), today, { includeLater: later === "1" })
    : null;
  const counts: OpenStocktake[] | null = can(user.role, "stocktake.count")
    ? await openStocktakes(getDatabase())
    : null;
  const shipping: MobileTask[] | null = can(user.role, "deliveries.pick")
    ? await mobileTasks(getDatabase(), today)
    : null;
  // A session still being counted is today's work too (spec mobile-home),
  // and so is every delivery note due by today.
  const due =
    (work?.dueToday ?? 0) +
    (counts?.filter((session) => session.status === "COUNTING").length ?? 0) +
    (shipping?.length ?? 0);
  const day = weekday.format(now);
  return (
    <MobilePage title="Việc hôm nay">
      <section data-mask className="flex flex-col gap-1">
        <p className="text-label text-muted-foreground">
          {day.charAt(0).toUpperCase() + day.slice(1)},{" "}
          {formatBusinessDate(today)}
        </p>
        <h2 className="font-display text-h2">
          {due > 0
            ? `Chào ${givenName(user.name)}, hôm nay có ${due} việc`
            : `Chào ${givenName(user.name)}, hôm nay chưa có việc nào`}
        </h2>
      </section>
      <DraftBanner userId={user.id} />
      {work && work.cards.length > 0 ? (
        <ArrivalList cards={work.cards} later={work.later} userId={user.id} />
      ) : (
        <p className="rounded-lg border bg-card p-4 text-body text-muted-foreground">
          Xe sắp về sẽ hiện ở đây.
        </p>
      )}
      {shipping && (
        <DeliveryHome tasks={shipping} today={today} userId={user.id} />
      )}
      {counts && <StocktakeHome sessions={counts} userId={user.id} />}
    </MobilePage>
  );
}
