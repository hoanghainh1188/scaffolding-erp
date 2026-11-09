import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ProductionActions } from "@/components/production/production-actions";
import { ProductionForm } from "@/components/production/production-form";
import { ProductionView } from "@/components/production/production-view";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import {
  bomNorms,
  getProductionOrder,
  orderItemChoices,
  productionPlaces,
} from "@/lib/production/queries";
import { PRODUCTION_CODE } from "@/lib/production/respond";

type Params = Promise<{ code: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { code } = await params;
  return { title: `Lệnh sản xuất ${code}` };
}

/** D20: a draft to edit, or the order with its buttons. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await requirePermission("production.view");
  const { code } = await params;
  if (!PRODUCTION_CODE.test(code)) notFound();
  await connection();
  const db = getDatabase();
  const detail = await getProductionOrder(db, code);
  if (!detail) notFound();
  const canManage = can(user.role, "production.manage");
  const canApprove = can(user.role, "production.approve");
  const editable = detail.status === "DRAFT" && canManage;
  const [places, items] = editable
    ? await Promise.all([productionPlaces(db), orderItemChoices(db)])
    : [[], []];
  const norms = editable
    ? await bomNorms(
        db,
        items.map((item) => item.itemId),
      )
    : {};
  const saved = (await searchParams).saved === "draft";
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/production" className="hover:underline">
          Sản xuất
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">{detail.code}</span>
      </nav>
      {saved ? (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          Đã lưu nháp {detail.code}.
        </p>
      ) : null}
      {editable ? (
        <ProductionForm
          places={places}
          items={items}
          norms={norms}
          draft={{
            code: detail.code,
            updatedAt: detail.updatedAt.toISOString(),
            workshopId: detail.workshop.id,
            toLocationId: detail.to.id,
            team: detail.team,
            note: detail.note,
            lines: detail.lines.map((line) => ({
              itemId: line.itemId,
              plannedMilli: line.plannedMilli,
            })),
          }}
        />
      ) : (
        <ProductionView
          detail={detail}
          actions={
            canManage || canApprove ? (
              <ProductionActions
                code={detail.code}
                status={detail.status}
                updatedAt={detail.updatedAt.toISOString()}
                canManage={canManage}
                canApprove={canApprove}
              />
            ) : undefined
          }
        />
      )}
    </div>
  );
}
