import { ImageIcon } from "lucide-react";

import {
  megabytes,
  PHOTO_MESSAGES,
  PHOTO_STORAGE_WARN_BYTES,
  photoStorageStatus,
} from "@/domain/return-photo";

/** Return photos kept in the database and the warning above 200 MB (0.2 #65). */
export function PhotoStorage({ bytes }: { bytes: number }) {
  const warning = photoStorageStatus(bytes) === "warning";
  return (
    <section
      aria-labelledby="photo-storage-title"
      className={`flex max-w-xl items-start gap-4 rounded-lg border bg-card p-5 ${warning ? "border-warning" : ""}`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
        <ImageIcon aria-hidden className="size-5" />
      </span>
      <span className="flex flex-1 flex-col gap-1">
        <h2 id="photo-storage-title" className="text-label">
          Dung lượng ảnh thu hồi
        </h2>
        <span className="text-body text-muted-foreground">
          {megabytes(bytes)} MB / ngưỡng cảnh báo{" "}
          {megabytes(PHOTO_STORAGE_WARN_BYTES)} MB
        </span>
        {warning ? (
          <span role="status" className="text-body text-warning">
            {PHOTO_MESSAGES.storageWarning(megabytes(bytes))}
          </span>
        ) : null}
      </span>
    </section>
  );
}
