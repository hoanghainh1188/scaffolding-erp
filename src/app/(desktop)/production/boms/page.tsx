import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { BomEditor } from "@/components/production/bom-editor";
import { ProductionTabs } from "@/components/production/production-tabs";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import {
  finishedCandidates,
  getBom,
  listBoms,
  materialChoices,
} from "@/lib/production/queries";

export const metadata: Metadata = { title: "Định mức sản xuất" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/** D19 (spec production-boms): the chosen item lives in the URL. */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("production.view");
  await connection();
  const params = await searchParams;
  const canManage = can(user.role, "production.manage");
  const db = getDatabase();
  const [rows, candidates, materials] = await Promise.all([
    listBoms(db),
    canManage ? finishedCandidates(db) : Promise.resolve([]),
    canManage ? materialChoices(db) : Promise.resolve([]),
  ]);
  const newCode = canManage ? single(params.new) : undefined;
  const creating = newCode
    ? (candidates.find((item) => item.code === newCode) ?? null)
    : null;
  const code = single(params.item) ?? rows[0]?.code;
  const bom = !creating && code ? await getBom(db, code) : null;
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/production" className="hover:underline">
          Sản xuất
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Định mức</span>
      </nav>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Định mức sản xuất</h1>
        <p className="text-sm text-muted-foreground">
          Nguyên liệu cần cho 1 thành phẩm. Chỉ Giám đốc, Kế toán sửa. Lệnh đã
          giao xưởng giữ định mức lúc giao.
        </p>
      </div>
      <ProductionTabs active="boms" />
      <BomEditor
        rows={rows}
        bom={bom}
        creating={creating}
        candidates={candidates}
        materials={materials}
        canManage={canManage}
      />
    </div>
  );
}
