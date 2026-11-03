import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ReturnPicker } from "@/components/returns/return-picker";
import { ReturnScreen } from "@/components/returns/return-screen";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { getDatabase } from "@/db/client";
import { requirePermission } from "@/lib/auth/guard";
import { returnContract, returnContracts } from "@/lib/returns/queries";

export const metadata: Metadata = { title: "Phiếu thu hồi" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() || null;

/** M4 (spec returns). No price or money on this page. */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("returns.receive");
  const params = await searchParams;
  const contractId = one(params.contract);
  const plate = one(params.plate);
  await connection();
  const db = getDatabase();
  if (!contractId) {
    const query = one(params.q) ?? "";
    return (
      <MobilePage title="Phiếu thu hồi" backHref="/m">
        <ReturnPicker
          rows={await returnContracts(db, query || undefined)}
          query={query}
          plate={plate}
        />
      </MobilePage>
    );
  }
  const found = await returnContract(db, contractId);
  if (!found.ok) notFound();
  const contract = found.data;
  return (
    <MobilePage title="Phiếu thu hồi" backHref="/m/returns/new">
      <ReturnScreen
        userId={user.id}
        contractId={contract.contractId}
        contractCode={contract.contractCode}
        siteName={contract.siteName}
        customerName={contract.customerName}
        yards={contract.yards}
        items={contract.items.map((row) => ({
          itemId: row.itemId,
          code: row.code,
          name: row.name,
          unit: row.unit,
          onSiteMilli: row.onSiteMilli,
        }))}
        plate={plate ?? undefined}
      />
    </MobilePage>
  );
}
