import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { StocktakeCount } from "@/components/stocktake/stocktake-count";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { requirePermission } from "@/lib/auth/guard";
import { countView } from "@/lib/stocktakes/queries";
import { STOCKTAKE_CODE } from "@/lib/stocktakes/respond";

export const metadata: Metadata = { title: "Kiểm kê" };

type Params = Promise<{ code: string }>;

const CLOSED = {
  SUBMITTED: (code: string) =>
    `Đã gửi ${code} về văn phòng. Chờ Giám đốc duyệt.`,
  DONE: (code: string) => `${code} đã được duyệt và ghi sổ.`,
  CANCELLED: (code: string) => `${code} đã hủy.`,
} as const;

/** M6 (spec stocktakes "Đếm theo mã, xong mã này", "Đếm mù"). */
export default async function Page({ params }: { params: Params }) {
  const user = await requirePermission("stocktake.count");
  await connection();
  const { code } = await params;
  const view = STOCKTAKE_CODE.test(code)
    ? await countView(getDatabase(), code)
    : null;
  if (!view) notFound();

  if (view.status !== "COUNTING") {
    return (
      <MobilePage title={`Kiểm kê ${view.code}`} backHref="/m">
        <p role="status" className="rounded-lg border bg-card p-4 text-body">
          {CLOSED[view.status](view.code)}
        </p>
        <Button asChild className="h-12 self-start">
          <Link href="/m">Về Việc hôm nay</Link>
        </Button>
      </MobilePage>
    );
  }
  return (
    <MobilePage title={`Kiểm kê ${view.code}`} backHref="/m">
      <StocktakeCount
        userId={user.id}
        canCancel
        view={{
          ...view,
          status: view.status,
          startedAt: view.startedAt.toISOString(),
          lines: view.lines.map((line) => ({
            id: line.id,
            itemId: line.itemId,
            itemCode: line.itemCode,
            itemName: line.itemName,
            unit: line.unit,
            groupName: line.groupName,
            condition: line.condition,
            origin: line.origin,
            counted: line.counted,
            recount: line.recount,
          })),
        }}
      />
    </MobilePage>
  );
}
