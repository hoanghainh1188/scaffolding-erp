"use client";

import { useRouter } from "next/navigation";

import { useCatalogAction } from "@/components/catalog/use-catalog-action";
import { Button } from "@/components/ui/button";

import { ReasonDialog } from "./reason-dialog";

/** "Hủy phiên" on D13: the director cancels a session not yet posted. */
export function StocktakeCancel({ code }: { code: string }) {
  const router = useRouter();
  const action = useCatalogAction();
  return (
    <ReasonDialog
      trigger={
        <Button variant="ghost" className="text-destructive">
          Hủy phiên
        </Button>
      }
      title={`Hủy ${code}?`}
      description="Phiên đã hủy không ghi gì vào sổ kho. Vị trí này bắt đầu được phiên mới."
      label="Lý do hủy"
      confirmLabel="Hủy phiên"
      destructive
      pending={action.pending}
      error={action.error}
      onConfirm={async (reason) => {
        const done = await action.run(
          `/api/stocktakes/${encodeURIComponent(code)}/cancel`,
          { method: "POST", body: { reason } },
        );
        if (done) router.refresh();
        return Boolean(done);
      }}
    />
  );
}
