"use client";

// "Thấy hàng không có trong danh sách" on M6 (spec stocktakes "Thêm dòng
// ngoài danh sách"): find an active item by code, name or its QR label.
import { ScanLine } from "lucide-react";
import { useState } from "react";

import { QrScanner } from "@/components/scan/qr-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { QuantityUnit } from "@/domain/quantity";
import { callApi } from "@/lib/api-client";

import type { CatalogItem } from "./stocktake-model";

interface AddItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Starts with the scanner (the "Quét mã" button). */
  scanFirst: boolean;
  onPick: (item: CatalogItem) => void;
}

interface ItemRow {
  id: string;
  code: string;
  name: string;
  unit: QuantityUnit;
}

export function AddItemSheet({
  open,
  onOpenChange,
  scanFirst,
  onPick,
}: AddItemSheetProps) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(scanFirst);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setScanning(scanFirst);
      setMessage(null);
    }
  }

  async function search(text: string): Promise<ItemRow[]> {
    const result = await callApi<{ items: ItemRow[] }>(
      `/api/catalog/items?q=${encodeURIComponent(text)}`,
    );
    if (!result.ok) {
      setMessage(result.error);
      return [];
    }
    setMessage(result.data.items.length ? null : `Không tìm thấy "${text}"`);
    return result.data.items;
  }

  const pick = (row: ItemRow) => {
    onPick({
      itemId: row.id,
      itemCode: row.code,
      itemName: row.name,
      unit: row.unit,
    });
    onOpenChange(false);
  };

  async function scanned(code: string) {
    const found = (await search(code)).find((row) => row.code === code);
    if (found) pick(found);
    else setMessage(`Không tìm thấy mã ${code}`);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Tìm mã hàng</SheetTitle>
          <SheetDescription>
            Quét nhãn hoặc gõ mã, tên hàng. Mã đã có trong phiên sẽ mở thẻ của
            mã đó.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          {scanning ? (
            <QrScanner onCode={(code) => void scanned(code)} notice={message} />
          ) : (
            <form
              className="flex gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                setRows(await search(q));
              }}
            >
              <Input
                type="search"
                aria-label="Tìm mã hoặc tên hàng"
                placeholder="Tìm mã hoặc tên hàng"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                className="h-12"
              />
              <Button type="submit" className="h-12">
                Tìm
              </Button>
            </form>
          )}
          <Button
            type="button"
            variant="secondary"
            className="h-11 self-start"
            onClick={() => setScanning((value) => !value)}
          >
            <ScanLine aria-hidden />{" "}
            {scanning ? "Gõ mã thay vì quét" : "Quét mã"}
          </Button>
          {!scanning && message && (
            <p className="text-caption text-muted-foreground">{message}</p>
          )}
          {!scanning && rows.length > 0 && (
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => pick(row)}
                    className="flex w-full flex-col items-start rounded-lg border bg-card p-3 text-left"
                  >
                    <span className="text-label">{row.name}</span>
                    <span className="text-caption text-muted-foreground">
                      {row.code}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
