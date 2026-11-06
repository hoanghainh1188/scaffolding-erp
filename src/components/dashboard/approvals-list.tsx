// "Chờ bạn duyệt" / "Đang chờ Giám đốc duyệt" of D1 (0.2 #94): the rows the
// greeting counts, oldest sent first, each opening its approval screen.
import Link from "next/link";

import type { Role } from "@/domain/role";
import { approvalsTitle } from "@/domain/dashboard";
import type { ApprovalRow } from "@/lib/dashboard/approvals";

import { money } from "./format";
import { Panel, TitleCount } from "./panel";

export function ApprovalsList({
  role,
  rows,
}: {
  role: Role;
  rows: readonly ApprovalRow[];
}) {
  return (
    <Panel
      id="approvals"
      title={
        <>
          {approvalsTitle(role)}
          <TitleCount count={rows.length} />
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="text-body text-muted-foreground">Không có việc nào.</p>
      ) : (
        <ul className="h-80 overflow-y-auto" data-mask>
          {rows.map((row) => (
            <li
              key={`${row.kind}-${row.code}`}
              className="flex items-center gap-3 border-b py-3 last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={row.href}
                  className="text-label text-primary hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {row.label} {row.code}
                </Link>
                <span className="truncate text-caption font-normal text-muted-foreground">
                  {[row.party, row.summary].filter(Boolean).join(" · ")}
                </span>
              </span>
              {row.amount !== null ? (
                <strong className="text-label whitespace-nowrap tabular-nums">
                  {money(row.amount)}
                </strong>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
