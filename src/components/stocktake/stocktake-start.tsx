"use client";

// M6a "Bắt đầu kiểm kê" (spec stocktakes "Phạm vi và dòng đếm của phiên",
// design D4, D8): a yard or the workshop, every item with stock or some
// groups, then the session is made on the server (it needs the network).
import { EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { FormError } from "@/components/catalog/form-error";
import { Button } from "@/components/ui/button";
import { STOCKTAKE_MESSAGES } from "@/domain/stocktake";
import { callApi, NETWORK_ERROR_MESSAGE } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export interface StartPlaceOption {
  id: string;
  code: string;
  name: string;
  lines: number;
  /** "30/09/2026", or null when never counted. */
  lastDone: string | null;
  openCode: string | null;
  groups: { id: string; name: string; lines: number }[];
}

interface StocktakeStartProps {
  places: StartPlaceOption[];
}

const optionClass = (selected: boolean) =>
  cn(
    "flex w-full flex-col items-start gap-1 rounded-lg border bg-card p-4 text-left",
    selected ? "border-2 border-primary" : "border-border",
  );

export function StocktakeStart({ places }: StocktakeStartProps) {
  const router = useRouter();
  // A place still holding a session cannot start another (design D4).
  const [placeId, setPlaceId] = useState(
    (places.find((row) => !row.openCode) ?? places[0])?.id ?? "",
  );
  const [all, setAll] = useState(true);
  const [groups, setGroups] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // One request id per screen: a retry after a lost answer is the same start.
  const startId = useRef<string | null>(null);

  const place = places.find((row) => row.id === placeId);
  const lines = !place
    ? 0
    : all
      ? place.lines
      : place.groups
          .filter((group) => groups.includes(group.id))
          .reduce((sum, group) => sum + group.lines, 0);

  function choosePlace(id: string) {
    setPlaceId(id);
    setGroups([]);
    setError(null);
    startId.current = null;
  }

  function toggleGroup(id: string) {
    setAll(false);
    setError(null);
    startId.current = null;
    setGroups((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function start() {
    if (!place) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError(STOCKTAKE_MESSAGES.offlineStart);
      return;
    }
    startId.current ??= crypto.randomUUID();
    setPending(true);
    setError(null);
    const result = await callApi<{ code: string }>("/api/stocktakes", {
      method: "POST",
      body: {
        clientStartId: startId.current,
        locationId: place.id,
        groupIds: all ? null : groups,
      },
    });
    setPending(false);
    if (!result.ok) {
      setError(
        result.error === NETWORK_ERROR_MESSAGE
          ? STOCKTAKE_MESSAGES.offlineStart
          : result.error,
      );
      return;
    }
    router.push(`/m/stocktake/${encodeURIComponent(result.data.code)}`);
  }

  if (places.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-4 text-body text-muted-foreground">
        Chưa có bãi hay xưởng nào đang dùng.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-32">
      <p className="text-label text-muted-foreground">Chỉ kiểm bãi và xưởng</p>
      <section aria-labelledby="where-title" className="flex flex-col gap-3">
        <h2 id="where-title" className="text-h3">
          Kiểm ở đâu
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="where-title"
          className="flex flex-col gap-3"
        >
          {places.map((row) => (
            <button
              key={row.id}
              type="button"
              role="radio"
              aria-checked={row.id === placeId}
              className={optionClass(row.id === placeId)}
              onClick={() => choosePlace(row.id)}
            >
              <span className="text-label">
                {row.code} · {row.name}
              </span>
              {/* Live numbers: one full-width line, masked in screenshots. */}
              <span
                data-mask
                className="block w-full text-caption text-muted-foreground"
              >
                Lần trước: {row.lastDone ?? "chưa kiểm"} · {row.lines} dòng hàng
                có tồn
              </span>
              {row.openCode && (
                <span className="text-caption text-warning">
                  Đang có phiên {row.openCode} chưa xong
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {place && (
        <section aria-labelledby="what-title" className="flex flex-col gap-3">
          <h2 id="what-title" className="text-h3">
            Đếm những mã nào
          </h2>
          <button
            type="button"
            role="radio"
            aria-checked={all}
            className={optionClass(all)}
            onClick={() => {
              setAll(true);
              setGroups([]);
              startId.current = null;
            }}
          >
            <span className="text-label">Tất cả mã có tồn ở {place.code}</span>
            <span className="text-caption text-muted-foreground">
              <span data-mask>{place.lines}</span> dòng (mã + tình trạng)
            </span>
          </button>
          <div
            className={cn(
              "flex flex-col gap-3 rounded-lg border bg-card p-4",
              !all && "border-2 border-primary",
            )}
          >
            <div className="flex flex-col gap-1">
              <span className="text-label">Chọn nhóm hàng</span>
              <span className="text-caption text-muted-foreground">
                Chia nhỏ để đếm trong một buổi
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {place.groups.map((group) => {
                const chosen = !all && groups.includes(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      "h-11 rounded-pill border px-4 text-label",
                      chosen
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card",
                    )}
                  >
                    {group.name} (<span data-mask>{group.lines}</span>)
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <div className="flex gap-3 rounded-lg border bg-muted p-4">
        <EyeOff aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-1 text-body">
          <p className="text-label">Đếm mù: máy không hiện số trên sổ.</p>
          <p className="text-muted-foreground">
            Đếm xong mã nào bấm &quot;Xong mã này&quot;. Máy lấy số sổ đúng lúc
            đó để so. Vẫn nhập, xuất bình thường trong lúc đếm.
          </p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t bg-card">
        <div className="mx-auto flex max-w-[640px] flex-col gap-2 px-4 py-3">
          <FormError message={error} />
          <Button
            type="button"
            className="h-12"
            disabled={pending || lines === 0 || Boolean(place?.openCode)}
            onClick={() => void start()}
          >
            Bắt đầu đếm <span data-mask>{lines}</span> dòng
          </Button>
        </div>
      </div>
    </div>
  );
}
