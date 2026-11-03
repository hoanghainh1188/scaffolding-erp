import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import {
  ContractGroups,
  contractListHref,
} from "@/components/contracts/contract-groups";
import { ContractFilters } from "@/components/contracts/contract-filters";
import { ContractTable } from "@/components/contracts/contract-table";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import type { ContractGroup } from "@/domain/contract";
import { can, canContract } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import {
  CONTRACT_PAGE_SIZE,
  listContracts,
  sellerOptions,
} from "@/lib/contracts/list";
import { contractFilterFrom } from "@/lib/contracts/respond";

export const metadata: Metadata = { title: "Hợp đồng" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** D4: rental and sale contracts the user may see (contracts spec). */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("sales.view");
  const params = await searchParams;
  const filter = contractFilterFrom(params);
  await connection();
  const db = getDatabase();
  const [list, sellers] = await Promise.all([
    listContracts(db, user, filter, toBusinessDate(new Date())),
    sellerOptions(db),
  ]);
  const canCreate = (["RENTAL", "SALE"] as const).some((type) =>
    canContract(user, type, "manage"),
  );
  const approver = can(user.role, "contracts.approve");
  const href = (changes: Record<string, string | null>) =>
    contractListHref(params, changes);
  const groupHref = (group: ContractGroup) =>
    href({ group: group === "all" ? null : group });
  const first = (list.page - 1) * CONTRACT_PAGE_SIZE + 1;
  const last = first + list.rows.length - 1;

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Hợp đồng</h1>
          <p className="text-sm text-muted-foreground">
            {approver && list.counts.pending > 0 ? (
              <>
                <strong className="text-foreground">
                  {list.counts.pending} hợp đồng
                </strong>{" "}
                đang chờ bạn duyệt
              </>
            ) : list.types.length === 1 ? (
              list.types[0] === "RENTAL" ? (
                "Hợp đồng cho thuê"
              ) : (
                "Hợp đồng bán"
              )
            ) : (
              "Hợp đồng cho thuê và hợp đồng bán"
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canContract(user, "RENTAL", "view") ? (
            <Button asChild variant="outline">
              <Link href="/sales/compensations?status=PENDING">
                Phiếu đền bù
              </Link>
            </Button>
          ) : null}
          {canCreate ? (
            <Button asChild>
              <Link href="/sales/contracts/new">
                <Plus aria-hidden /> Tạo hợp đồng
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <section
        aria-labelledby="contracts-title"
        className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5"
      >
        <h2 id="contracts-title" className="sr-only">
          Danh sách hợp đồng
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ContractGroups
            active={filter.group ?? "all"}
            counts={list.counts}
            hrefOf={groupHref}
          />
          <div className="min-w-0 flex-1 basis-80">
            <ContractFilters types={list.types} sellers={sellers} />
          </div>
        </div>
        {list.rows.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            {list.counts.all === 0 && !filter.q
              ? "Chưa có hợp đồng nào. Bạn bấm Tạo hợp đồng để lập báo giá đầu tiên."
              : "Không có hợp đồng nào khớp bộ lọc"}
          </p>
        ) : (
          <ContractTable rows={list.rows} />
        )}
        {list.total > 0 ? (
          <nav
            aria-label="Phân trang"
            className="flex items-center justify-end gap-3 text-sm text-muted-foreground"
          >
            <span className="tabular-nums">
              {first}–{last} / {list.total}
            </span>
            {list.page > 1 ? (
              <Link
                href={href({ page: String(list.page - 1) })}
                className="inline-flex h-9 items-center rounded-md border px-3 hover:bg-accent"
              >
                Trang trước
              </Link>
            ) : null}
            {list.page < list.pageCount ? (
              <Link
                href={href({ page: String(list.page + 1) })}
                className="inline-flex h-9 items-center rounded-md border px-3 hover:bg-accent"
              >
                Trang sau
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
