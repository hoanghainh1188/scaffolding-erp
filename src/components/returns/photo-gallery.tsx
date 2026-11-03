/* eslint-disable @next/next/no-img-element -- private photos come from an
   authenticated route; the image optimizer would fetch them without the
   user's cookie. */
interface PhotoGalleryProps {
  photos: readonly { id: string; caption: string | null }[];
  /** Shown under the heading: "4 ảnh · chụp khi xe hạ tải". */
  empty?: string;
}

/** Return photos, each opening full size in a new tab (design D4). */
export function PhotoGallery({ photos, empty }: PhotoGalleryProps) {
  if (photos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {empty ?? "Không có ảnh."}
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {photos.map((photo, index) => (
        <li key={photo.id} className="flex flex-col gap-1">
          <a
            href={`/api/returns/photos/${photo.id}`}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <img
              src={`/api/returns/photos/${photo.id}`}
              alt={photo.caption ?? `Ảnh hiện trạng ${index + 1}`}
              width={320}
              height={240}
              loading="lazy"
              className="aspect-[4/3] w-full bg-muted object-cover"
            />
          </a>
          {photo.caption ? (
            <span className="text-caption text-muted-foreground">
              {photo.caption}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
