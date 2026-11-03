// Shrinks a photo on the phone before it goes into the draft (design D4):
// longest edge PHOTO_MAX_EDGE, JPEG 0,8. Redrawing on a canvas also drops
// most EXIF, but the server re-encodes anyway and never trusts this step.
// Runs in the browser only; without canvas support the file goes as it is.
import { PHOTO_MAX_EDGE } from "@/domain/return-photo";

export async function resizePhoto(file: Blob): Promise<Blob> {
  if (
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(
    1,
    PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.8),
  );
  return blob ?? file;
}
