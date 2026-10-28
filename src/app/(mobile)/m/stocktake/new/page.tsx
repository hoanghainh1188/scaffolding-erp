import type { Metadata } from "next";
import { connection } from "next/server";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { StocktakeStart } from "@/components/stocktake/stocktake-start";
import { getDatabase } from "@/db/client";
import { formatBusinessDate, toBusinessDate } from "@/domain/business-date";
import { requirePermission } from "@/lib/auth/guard";
import { startOptions } from "@/lib/stocktakes/queries";

export const metadata: Metadata = { title: "Bắt đầu kiểm kê" };

/** M6a (spec stocktakes "Phạm vi và dòng đếm của phiên"). */
export default async function Page() {
  await requirePermission("stocktake.count");
  await connection();
  const places = await startOptions(getDatabase());
  return (
    <MobilePage title="Bắt đầu kiểm kê" backHref="/m">
      <StocktakeStart
        places={places.map((place) => ({
          id: place.id,
          code: place.code,
          name: place.name,
          lines: place.lines,
          lastDone: place.lastDoneAt
            ? formatBusinessDate(toBusinessDate(place.lastDoneAt))
            : null,
          openCode: place.openCode,
          groups: place.groups,
        }))}
      />
    </MobilePage>
  );
}
