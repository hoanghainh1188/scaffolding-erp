"use client";

// M4 "Nhập thu hồi" (returns spec, return-photos spec; design D13). Counting
// runs on the phone draft, so it goes on when the signal drops; saving
// queues the draft with its photos and the outbox sends them. No price or
// money is shown.
import { Camera, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { amountText } from "@/components/deliveries/format";
import { Stepper } from "@/components/domain/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatQuantityForInput, toQuantity } from "@/domain/quantity";
import {
  PHOTO_CAPTION_MAX,
  PHOTO_MAX_PER_NOTE,
  PHOTO_MESSAGES,
} from "@/domain/return-photo";
import { useDraft } from "@/hooks/use-draft";
import { outboxFor, postedNotices } from "@/lib/drafts/runtime";
import { resizePhoto } from "@/lib/returns/resize-photo";

import {
  blockers,
  bodyOf,
  checkLine,
  emptyLine,
  milliOf,
  progressText,
  SPLIT_FIELDS,
  SPLIT_LABELS,
  type CountedLine,
  type ReturnItem,
  type ReturnPayload,
} from "./return-model";

export const RETURN_SCREEN_MESSAGES = {
  queued: "Chưa gửi được, phiếu và ảnh sẽ tự gửi khi có mạng",
  signedOut: "Phiên đăng nhập hết hạn. Đăng nhập lại để gửi phiếu.",
} as const;

export interface ReturnScreenProps {
  userId: string;
  contractId: string;
  contractCode: string;
  siteName: string;
  customerName: string;
  yards: { id: string; code: string; name: string }[];
  items: ReturnItem[];
  /** Kept from the note just saved for another contract of the same truck. */
  plate?: string;
}

/** A small preview of a photo kept as a Blob in the draft. */
function Thumb({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (typeof URL.createObjectURL !== "function") return;
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob]);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- a local Blob URL
    <img
      src={url}
      alt={alt}
      width={160}
      height={120}
      className="aspect-[4/3] w-full rounded-md border bg-muted object-cover"
    />
  ) : (
    <span
      role="img"
      aria-label={alt}
      className="block aspect-[4/3] w-full rounded-md border bg-muted"
    />
  );
}

export function ReturnScreen(props: ReturnScreenProps) {
  const router = useRouter();
  const draft = useDraft<ReturnPayload>({
    kind: "RETURN",
    userId: props.userId,
    // One draft per contract on this phone; M1 / M7 link back by its id.
    documentRef: props.contractId,
    title: `Thu hồi ${props.siteName}`,
    initial: () => ({
      contractId: props.contractId,
      yardLocationId:
        props.yards.length === 1 ? (props.yards[0]?.id ?? "") : "",
      vehiclePlate: props.plate ?? "",
      note: "",
      opened: [],
      lines: {},
      photos: [],
      savedOnDeviceAt: null,
    }),
    progressOf: (payload) => progressText(props.items, payload),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);

  const payload = draft.payload;
  const shown = useMemo(
    () =>
      payload.opened
        .map((id) => props.items.find((item) => item.itemId === id))
        .filter((item): item is ReturnItem => item !== undefined),
    [payload.opened, props.items],
  );

  if (posted) {
    return (
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-4">
        <h2 className="font-display text-h2">Đã lưu {posted}</h2>
        <p className="text-body text-muted-foreground">
          Sổ kho đã ghi hàng về bãi. Văn phòng sẽ thấy phiếu đền bù nếu có hàng
          hỏng hoặc mất.
        </p>
        <Button asChild className="h-12">
          <Link
            href={`/m/returns/new${payload.vehiclePlate ? `?plate=${encodeURIComponent(payload.vehiclePlate)}` : ""}`}
          >
            Thu hồi hợp đồng khác cùng xe
          </Link>
        </Button>
        <Button asChild variant="secondary" className="h-12">
          <Link href="/m">Về Việc hôm nay</Link>
        </Button>
      </section>
    );
  }
  if (!draft.ready) {
    return <p className="text-body text-muted-foreground">Đang mở phiếu…</p>;
  }

  const locked = !draft.editable || busy;
  const queued =
    draft.record?.state === "QUEUED" || draft.record?.state === "SENDING";
  const rejected =
    draft.record?.state === "REJECTED" ? draft.record.error : null;
  const problems = blockers(props.items, payload);
  const savedAt = draft.record?.updatedAt
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(draft.record.updatedAt))
    : null;

  const setLine = (
    itemId: string,
    change: (current: CountedLine) => CountedLine,
  ) =>
    draft.update((current) => ({
      ...current,
      lines: {
        ...current.lines,
        [itemId]: change(current.lines[itemId] ?? emptyLine()),
      },
    }));

  const open = (itemId: string) =>
    draft.update((current) =>
      current.opened.includes(itemId)
        ? current
        : { ...current, opened: [...current.opened, itemId] },
    );

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setMessage(null);
    const room = PHOTO_MAX_PER_NOTE - payload.photos.length;
    if (room <= 0) {
      setMessage(PHOTO_MESSAGES.tooManyOnPhone);
      return;
    }
    const picked = [...files].slice(0, room);
    const photos = await Promise.all(
      picked.map(async (file) => ({
        clientPhotoId: crypto.randomUUID(),
        caption: null,
        blob: await resizePhoto(file),
        uploadedId: null,
      })),
    );
    draft.update((current) => ({
      ...current,
      photos: [...current.photos, ...photos],
    }));
    if (files.length > room) setMessage(PHOTO_MESSAGES.tooManyOnPhone);
  }

  async function save() {
    setMessage(null);
    if (problems.length > 0) {
      setMessage(problems.join(" "));
      return;
    }
    setBusy(true);
    const savedOnDeviceAt = new Date().toISOString();
    const saved = await draft.saveNow({
      payload: {
        ...payload,
        savedOnDeviceAt,
        body: bodyOf(props.items, payload, savedOnDeviceAt),
      },
      state: "QUEUED",
    });
    const outcome = await outboxFor(props.userId).submit(saved.draftId);
    setBusy(false);
    if (outcome.kind === "POSTED") {
      postedNotices.clear();
      setPosted(outcome.code);
      router.refresh();
    } else if (outcome.kind === "REJECTED") {
      router.refresh();
    } else if (outcome.kind === "SIGNED_OUT") {
      setMessage(RETURN_SCREEN_MESSAGES.signedOut);
    } else if (outcome.kind === "RETRY") {
      setMessage(RETURN_SCREEN_MESSAGES.queued);
    }
  }

  const unopened = props.items.filter(
    (item) => !payload.opened.includes(item.itemId),
  );

  return (
    <div className="flex flex-col gap-6 pb-40">
      <section className="flex flex-col gap-2">
        {savedAt ? (
          <p className="text-caption text-muted-foreground">
            Nháp · đã lưu trên máy lúc {savedAt}
          </p>
        ) : null}
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <span className="text-caption text-muted-foreground">
            Công trình trả hàng
          </span>
          <span className="text-label">{props.siteName}</span>
          <span className="text-body text-muted-foreground">
            {props.customerName} · {props.contractCode}
          </span>
        </div>
        {props.yards.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="yard">Bãi nhận hàng</Label>
            <select
              id="yard"
              value={payload.yardLocationId}
              disabled={locked}
              onChange={(event) =>
                draft.update({ ...payload, yardLocationId: event.target.value })
              }
              className="h-12 rounded-md border border-input bg-card px-3 text-base"
            >
              <option value="">Chọn bãi</option>
              {props.yards.map((yard) => (
                <option key={yard.id} value={yard.id}>
                  {yard.code} · {yard.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plate">Biển số xe</Label>
          <Input
            id="plate"
            value={payload.vehiclePlate}
            disabled={locked}
            maxLength={20}
            placeholder="29C-456.78"
            onChange={(event) =>
              draft.update({ ...payload, vehiclePlate: event.target.value })
            }
            className="h-12"
          />
        </div>
      </section>

      {(queued || message || rejected) && (
        <p
          role="status"
          className="rounded-lg border-2 border-warning bg-card p-4 text-label"
        >
          {message ?? rejected ?? RETURN_SCREEN_MESSAGES.queued}
        </p>
      )}

      <fieldset
        disabled={locked}
        aria-label="Vật tư trả về"
        className="flex min-w-0 flex-col gap-4"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-h3">Vật tư trả về</h2>
          <span className="text-caption text-muted-foreground">
            {progressText(props.items, payload)}
          </span>
        </div>
        {shown.map((item) => {
          const line = payload.lines[item.itemId] ?? emptyLine();
          const check = checkLine(item, line);
          const value = (text: string) =>
            toQuantity(milliOf(text, item.unit), item.unit);
          return (
            <article
              key={item.itemId}
              aria-label={item.code}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4"
            >
              <div className="flex flex-col gap-1">
                <p className="text-label">
                  {item.name}{" "}
                  <span className="text-muted-foreground">· {item.code}</span>
                </p>
                <p className="text-body text-muted-foreground">
                  Đang ở công trình: {amountText(item.onSiteMilli, item.unit)}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-caption text-muted-foreground">
                  Tổng trả về
                </span>
                <Stepper
                  label={`${item.code} tổng trả về`}
                  value={value(line.total)}
                  onValueChange={(next) =>
                    setLine(item.itemId, (current) => ({
                      ...current,
                      total: formatQuantityForInput(next),
                      // A first count is all Tốt until split otherwise.
                      good:
                        current.good === "" &&
                        current.repair === "" &&
                        current.scrap === ""
                          ? formatQuantityForInput(next)
                          : current.good,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-3">
                {SPLIT_FIELDS.map((field) => (
                  <div key={field} className="flex flex-col gap-1.5">
                    <span className="text-caption text-muted-foreground">
                      {SPLIT_LABELS[field]}
                    </span>
                    <Stepper
                      label={`${item.code} ${SPLIT_LABELS[field]}`}
                      value={value(line[field])}
                      onValueChange={(next) =>
                        setLine(item.itemId, (current) => ({
                          ...current,
                          [field]: formatQuantityForInput(next),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              <p
                className={
                  check.ok && !check.empty
                    ? "text-label text-success"
                    : check.ok
                      ? "text-label text-muted-foreground"
                      : "text-label text-warning"
                }
              >
                {check.text}
              </p>
            </article>
          );
        })}
        {unopened.map((item) => (
          <article
            key={item.itemId}
            aria-label={item.code}
            className="flex items-center justify-between gap-3 rounded-lg border border-dashed bg-card p-4"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-label">
                {item.name}{" "}
                <span className="text-muted-foreground">· {item.code}</span>
              </p>
              <p className="text-body text-muted-foreground">
                Đang ở công trình: {amountText(item.onSiteMilli, item.unit)} ·
                chưa đếm
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="h-12"
              onClick={() => open(item.itemId)}
            >
              Đếm
            </Button>
          </article>
        ))}
      </fieldset>

      <section aria-labelledby="photos-title" className="flex flex-col gap-3">
        <h2 id="photos-title" className="text-h3">
          Ảnh hiện trạng
        </h2>
        <p className="text-body text-muted-foreground">
          Chụp hàng móp, gãy để làm bằng chứng tính đền bù.
        </p>
        <ul className="grid grid-cols-2 gap-3">
          {payload.photos.map((photo, index) => (
            <li key={photo.clientPhotoId} className="flex flex-col gap-1.5">
              <Thumb
                blob={photo.blob}
                alt={photo.caption ?? `Ảnh ${index + 1}`}
              />
              <Input
                aria-label={`Chú thích ảnh ${index + 1}`}
                value={photo.caption ?? ""}
                maxLength={PHOTO_CAPTION_MAX}
                disabled={locked}
                placeholder="Chú thích"
                onChange={(event) =>
                  draft.update((current) => ({
                    ...current,
                    photos: current.photos.map((entry) =>
                      entry.clientPhotoId === photo.clientPhotoId
                        ? { ...entry, caption: event.target.value || null }
                        : entry,
                    ),
                  }))
                }
              />
              <Button
                type="button"
                variant="ghost"
                disabled={locked}
                onClick={() =>
                  draft.update((current) => ({
                    ...current,
                    photos: current.photos.filter(
                      (entry) => entry.clientPhotoId !== photo.clientPhotoId,
                    ),
                  }))
                }
              >
                <Trash2 aria-hidden /> Xóa ảnh {index + 1}
              </Button>
            </li>
          ))}
        </ul>
        <Label
          htmlFor="camera"
          className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md border bg-card px-4 text-label"
        >
          <Camera aria-hidden className="size-5" /> Chụp ảnh
        </Label>
        <input
          id="camera"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          disabled={locked}
          className="sr-only"
          onChange={(event) => {
            void addPhotos(event.target.files);
            event.target.value = "";
          }}
        />
      </section>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="return-note">Ghi chú</Label>
        <textarea
          id="return-note"
          value={payload.note}
          maxLength={500}
          disabled={locked}
          placeholder="Hàng lạ, hàng của hợp đồng khác…"
          onChange={(event) =>
            draft.update({ ...payload, note: event.target.value })
          }
          className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-base"
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 flex gap-2 border-t bg-card p-4">
        <Button
          variant="secondary"
          className="h-12 flex-1"
          disabled={locked}
          onClick={() => void draft.saveNow()}
        >
          Lưu nháp
        </Button>
        <Button
          className="h-12 flex-1"
          disabled={locked || problems.length > 0}
          onClick={() => void save()}
        >
          {busy ? "Đang lưu…" : "Lưu phiếu thu hồi"}
        </Button>
      </div>
    </div>
  );
}
