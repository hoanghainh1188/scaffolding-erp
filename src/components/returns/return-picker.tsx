import { Search } from "lucide-react";
import Link from "next/link";

import { totalsText } from "@/components/deliveries/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReturnContractRow } from "@/lib/returns/queries";

interface ReturnPickerProps {
  rows: readonly ReturnContractRow[];
  query: string;
  plate: string | null;
}

/** M4 step 1 (returns spec "Chọn công trình trên M4"). */
export function ReturnPicker({ rows, query, plate }: ReturnPickerProps) {
  const suffix = plate ? `&plate=${encodeURIComponent(plate)}` : "";
  return (
    <div className="flex flex-col gap-4">
      <form method="get" className="flex gap-2" role="search">
        {plate ? <input type="hidden" name="plate" value={plate} /> : null}
        <Input
          name="q"
          defaultValue={query}
          aria-label="Tìm công trình, nhà thầu hoặc số hợp đồng"
          placeholder="Công trình, nhà thầu, số hợp đồng"
          className="h-12"
        />
        <Button type="submit" className="h-12" aria-label="Tìm">
          <Search aria-hidden />
        </Button>
      </form>
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-body text-muted-foreground">
          {query
            ? "Không có công trình nào khớp. Thử tên khác."
            : "Chưa có công trình nào đang giữ hàng thuê."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.contractId}>
              <Link
                href={`/m/returns/new?contract=${row.contractId}${suffix}`}
                className="flex flex-col gap-1 rounded-lg border bg-card p-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="text-label">{row.siteName}</span>
                <span className="text-body text-muted-foreground">
                  {[
                    row.customerName,
                    row.contractCode,
                    totalsText(row.onSite),
                  ].join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
