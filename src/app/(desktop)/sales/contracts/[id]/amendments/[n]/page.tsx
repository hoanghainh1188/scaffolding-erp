import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { AmendmentForm } from "@/components/contracts/amendment-form";
import { ApprovalBar } from "@/components/contracts/approval-bar";
import { RevisionStatusBadge } from "@/components/contracts/contract-badges";
import { getDatabase } from "@/db/client";
import { formatBusinessDate } from "@/domain/business-date";
import { requirePermission } from "@/lib/auth/guard";
import { overdueDebt } from "@/lib/contracts/overdue";
import { formOptions, getAmendmentDetail } from "@/lib/contracts/queries";

export const metadata: Metadata = { title: "Phụ lục hợp đồng" };

type Params = Promise<{ id: string; n: string }>;

/** D5b: an amendment of an approved contract (contract-amendments spec). */
export default async function Page({ params }: { params: Params }) {
  const user = await requirePermission("sales.view");
  const { id, n } = await params;
  const db = getDatabase();
  const found = await getAmendmentDetail(db, user, id, Number(n));
  if (!found.ok) {
    if (found.status === 403) forbidden();
    notFound();
  }
  const detail = found.data;
  const [options, overdue] = await Promise.all([
    formOptions(db, user),
    overdueDebt(db, detail.head.customer.id),
  ]);
  const number = String(detail.amendment.number).padStart(2, "0");
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/sales/contracts" className="hover:underline">
          Hợp đồng
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href={`/sales/contracts/${id}`} className="hover:underline">
          {detail.head.code}
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Phụ lục {number}</span>
      </nav>
      {detail.can.approve ? (
        <ApprovalBar
          path={`/api/contracts/${id}/amendments/${detail.amendment.number}`}
          what="Phụ lục"
          submittedBy={detail.amendment.submitted?.name ?? null}
          submittedAt={detail.amendment.submitted?.at ?? null}
          overdue={overdue}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h1">Phụ lục {detail.amendment.code}</h1>
        <RevisionStatusBadge status={detail.amendment.status} />
      </div>
      <AmendmentForm detail={detail} options={options} />
      <section
        aria-labelledby="versions-title"
        className="flex flex-col gap-2 rounded-lg border bg-card p-5 text-sm"
      >
        <h2 id="versions-title" className="text-label">
          Các bản của hợp đồng
        </h2>
        <ul className="flex flex-col gap-1.5">
          {detail.revisions.map((revision) => (
            <li
              key={revision.number}
              className="flex flex-wrap items-center gap-2"
            >
              <span>
                {revision.number === 0
                  ? "Hợp đồng gốc"
                  : `Phụ lục ${String(revision.number).padStart(2, "0")}`}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatBusinessDate(revision.effectiveFrom)}
              </span>
              <RevisionStatusBadge status={revision.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
