"use client";

// "Mã sắt vụn" on /settings/scrap-price (spec production-boms, 0.2 số 152):
// the kg material item that receives the offcuts of every production order.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/api-client";
import type { ItemChoice } from "@/lib/production/queries";
import type { ScrapItemView } from "@/lib/production/settings";

interface ScrapItemFormProps {
  current: ScrapItemView | null;
  choices: ItemChoice[];
}

export function ScrapItemForm({ current, choices }: ScrapItemFormProps) {
  const router = useRouter();
  const [itemId, setItemId] = useState(current?.itemId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await callApi("/api/production/settings", {
      method: "PUT",
      body: { itemId },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-labelledby="scrap-item-title"
      className="flex flex-col gap-3 rounded-lg border bg-card p-5"
    >
      <h2 id="scrap-item-title" className="font-display text-h2">
        Mã sắt vụn
      </h2>
      <p className="text-body">
        {current ? `Mã sắt vụn: ${current.code}` : "Chưa chọn Mã sắt vụn"}
      </p>
      <p className="text-sm text-muted-foreground">
        Đầu thừa của mọi lệnh sản xuất nhập Phế liệu của mã này. Mã tính theo
        kg, nhóm Vật tư. Đổi mã không đổi lệnh đã ghi sổ.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="scrap-item">Chọn mã</Label>
        <select
          id="scrap-item"
          className="h-11 rounded-md border bg-card px-3 text-base"
          value={itemId}
          onChange={(event) => setItemId(event.target.value)}
        >
          <option value="">Chọn mã</option>
          {choices.map((choice) => (
            <option key={choice.itemId} value={choice.itemId}>
              {choice.code} · {choice.name}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        className="self-start"
        disabled={pending || !itemId}
      >
        Lưu mã sắt vụn
      </Button>
    </form>
  );
}
