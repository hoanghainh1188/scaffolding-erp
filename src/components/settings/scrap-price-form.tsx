"use client";

// "Giá mới (₫/kg)" on /settings/scrap-price (spec scrap-price, design D9).
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FieldMessage } from "@/components/purchasing/field-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DomainValueError } from "@/domain/errors";
import { parseMoney } from "@/domain/money";
import { NumericInput } from "@/components/domain/numeric-input";
import { SCRAP_PRICE_MESSAGES } from "@/domain/scrap-price";

export function ScrapPriceForm() {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    let pricePerKg: number;
    try {
      pricePerKg = parseMoney(price);
    } catch (error: unknown) {
      if (!(error instanceof DomainValueError)) throw error;
      setErrors({ pricePerKg: SCRAP_PRICE_MESSAGES.price });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/settings/scrap-price", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pricePerKg, note }),
      });
      const json = (await response.json()) as {
        error: string | null;
        data: { field?: string } | null;
      };
      if (!response.ok) {
        setErrors({ [json.data?.field ?? "pricePerKg"]: json.error ?? "" });
        return;
      }
      setErrors({});
      setPrice("");
      setNote("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-lg border bg-card p-5"
      aria-label="Giá mới"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="scrap-price" className="text-label">
          Giá mới (₫/kg)
        </label>
        <NumericInput
          id="scrap-price"
          kind="money"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          aria-invalid={errors.pricePerKg ? true : undefined}
          className="max-w-48 text-right tabular-nums"
          placeholder="7500"
        />
        <FieldMessage message={errors.pricePerKg} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="scrap-note" className="text-label">
          Ghi chú (không bắt buộc)
        </label>
        <Input
          id="scrap-note"
          value={note}
          maxLength={200}
          onChange={(event) => setNote(event.target.value)}
          placeholder="VD: Giá vựa Phúc Lâm báo ngày 28/10"
        />
        <FieldMessage message={errors.note} />
      </div>
      <Button type="submit" className="self-start" disabled={saving}>
        Lưu giá
      </Button>
    </form>
  );
}
