"use client";

// M2 "Quét mã" (spec item-scan): scan or type an item code, then show its
// stock from /api/stock/lookup.
import { useState } from "react";

import { formatDateTime } from "@/domain/business-date";
import type { StockLookup } from "@/lib/receiving/queries";

import { ItemStockCard } from "./item-stock-card";
import { QrScanner } from "./qr-scanner";

type Found =
  | { kind: "item"; item: StockLookup; at: string }
  | { kind: "error"; message: string };

export function ScanScreen({ canViewCard }: { canViewCard: boolean }) {
  const [found, setFound] = useState<Found | null>(null);

  async function lookUp(code: string) {
    try {
      const response = await fetch(
        `/api/stock/lookup?code=${encodeURIComponent(code)}`,
      );
      const json = (await response.json()) as {
        data: StockLookup | null;
        error: string | null;
      };
      setFound(
        response.ok && json.data
          ? {
              kind: "item",
              item: json.data,
              at: formatDateTime(new Date()).slice(11),
            }
          : {
              kind: "error",
              message: json.error ?? `Không tìm thấy mã ${code}`,
            },
      );
    } catch {
      setFound({ kind: "error", message: "Mất kết nối, chưa tra được mã" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <QrScanner onCode={(code) => void lookUp(code)} />
      {found?.kind === "error" && (
        <p role="alert" className="rounded-lg border bg-card p-4 text-body">
          {found.message}
        </p>
      )}
      {found?.kind === "item" && (
        <ItemStockCard
          item={found.item}
          scannedAt={found.at}
          canViewCard={canViewCard}
        />
      )}
    </div>
  );
}
