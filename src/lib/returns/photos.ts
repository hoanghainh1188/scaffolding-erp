// Return photos (returns-and-compensation design D4, 0.2 #65): the type is
// read from the bytes, EXIF and GPS are dropped by re-encoding with sharp,
// the server names every photo, and only people who may read the note get
// its bytes. Draft photos left behind are cleaned after a week.
import { and, count, eq, isNull, lt, sql } from "drizzle-orm";
import sharp from "sharp";

import type { Database } from "@/db/client";
import { returnPhoto } from "@/db/schema";
import { detectImageType } from "@/domain/image-type";
import { can } from "@/domain/permissions";
import {
  PHOTO_CAPTION_MAX,
  PHOTO_DRAFT_TTL_DAYS,
  PHOTO_MAX_EDGE,
  PHOTO_MAX_INPUT_PIXELS,
  PHOTO_MAX_PER_NOTE,
  PHOTO_MAX_UPLOAD_BYTES,
  PHOTO_MESSAGES,
  PHOTO_QUALITY,
} from "@/domain/return-photo";
import {
  badRequest,
  notFound,
  ok,
  type ServiceResult,
} from "@/lib/catalog/common";
import { forbidden, type ContractActor } from "@/lib/contracts/common";
import { isUuid } from "@/lib/deliveries/records";

import { canReadReturns } from "./queries";

type Reader = Pick<Database, "select">;
type ReadingActor = Pick<ContractActor, "id" | "role" | "contractScope">;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PhotoUpload {
  draftId?: string;
  clientPhotoId?: string;
  caption?: string | null;
  bytes: Uint8Array;
}

export interface UploadedPhoto {
  id: string;
  width: number;
  height: number;
}

export interface PhotoOptions {
  now?: Date;
}

const tooLarge = () =>
  ({ ok: false, status: 413, error: PHOTO_MESSAGES.tooLarge }) as const;

/** Decoded, turned upright, shrunk and saved as WebP without metadata. */
async function reencode(
  bytes: Uint8Array,
): Promise<{ data: Buffer; width: number; height: number } | null> {
  try {
    const { data, info } = await sharp(bytes, {
      limitInputPixels: PHOTO_MAX_INPUT_PIXELS,
      failOn: "error",
    })
      .rotate()
      .resize({
        width: PHOTO_MAX_EDGE,
        height: PHOTO_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: PHOTO_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/** Removes draft photos never attached to a note after a week (D4). */
async function pruneDraftPhotos(db: Database, now: Date): Promise<void> {
  await db
    .delete(returnPhoto)
    .where(
      and(
        isNull(returnPhoto.returnNoteId),
        lt(
          returnPhoto.uploadedAt,
          new Date(now.getTime() - PHOTO_DRAFT_TTL_DAYS * DAY_MS),
        ),
      ),
    );
}

/** POST /api/m/returns/photos: one photo of a draft (spec return-photos). */
export async function uploadReturnPhoto(
  db: Database,
  actor: ReadingActor,
  upload: PhotoUpload,
  options: PhotoOptions = {},
): Promise<ServiceResult<UploadedPhoto>> {
  if (!can(actor.role, "returns.receive")) return forbidden();
  if (!isUuid(upload.draftId) || !isUuid(upload.clientPhotoId)) {
    return badRequest(PHOTO_MESSAGES.notImage);
  }
  if (upload.bytes.byteLength > PHOTO_MAX_UPLOAD_BYTES) return tooLarge();
  if (detectImageType(upload.bytes) === null) {
    return badRequest(PHOTO_MESSAGES.notImage);
  }
  const caption = upload.caption?.trim() || null;
  if (caption !== null && caption.length > PHOTO_CAPTION_MAX) {
    return badRequest(PHOTO_MESSAGES.captionLong);
  }
  const now = options.now ?? new Date();
  await pruneDraftPhotos(db, now);

  const [sent] = await db
    .select({
      id: returnPhoto.id,
      width: returnPhoto.width,
      height: returnPhoto.height,
    })
    .from(returnPhoto)
    .where(
      and(
        eq(returnPhoto.clientDraftId, upload.draftId),
        eq(returnPhoto.clientPhotoId, upload.clientPhotoId),
        eq(returnPhoto.uploadedBy, actor.id),
      ),
    );
  if (sent) return ok(sent);
  const [held] = await db
    .select({ total: count() })
    .from(returnPhoto)
    .where(eq(returnPhoto.clientDraftId, upload.draftId));
  if ((held?.total ?? 0) >= PHOTO_MAX_PER_NOTE) {
    return badRequest(PHOTO_MESSAGES.tooMany);
  }

  const image = await reencode(upload.bytes);
  if (!image) return badRequest(PHOTO_MESSAGES.unreadable);
  const [row] = await db
    .insert(returnPhoto)
    .values({
      clientDraftId: upload.draftId,
      clientPhotoId: upload.clientPhotoId,
      caption,
      content: image.data,
      byteSize: image.data.byteLength,
      width: image.width,
      height: image.height,
      uploadedBy: actor.id,
      uploadedAt: now,
    })
    .onConflictDoNothing({
      target: [returnPhoto.clientDraftId, returnPhoto.clientPhotoId],
    })
    .returning({
      id: returnPhoto.id,
      width: returnPhoto.width,
      height: returnPhoto.height,
    });
  if (row) return ok(row);
  // The same photo sent twice at once: the first insert won.
  const [again] = await db
    .select({
      id: returnPhoto.id,
      width: returnPhoto.width,
      height: returnPhoto.height,
    })
    .from(returnPhoto)
    .where(
      and(
        eq(returnPhoto.clientDraftId, upload.draftId),
        eq(returnPhoto.clientPhotoId, upload.clientPhotoId),
        eq(returnPhoto.uploadedBy, actor.id),
      ),
    );
  return again ? ok(again) : notFound();
}

/**
 * The bytes of one photo, or 404 alike for "no such photo" and "not
 * yours" (design D4): a draft photo is its uploader's, a posted one is for
 * whoever may read the note.
 */
export async function readReturnPhoto(
  db: Reader,
  actor: ReadingActor,
  id: string,
): Promise<ServiceResult<{ content: Buffer }>> {
  if (!isUuid(id)) return notFound();
  const [row] = await db
    .select({
      content: returnPhoto.content,
      returnNoteId: returnPhoto.returnNoteId,
      uploadedBy: returnPhoto.uploadedBy,
    })
    .from(returnPhoto)
    .where(eq(returnPhoto.id, id));
  if (!row) return notFound();
  const allowed =
    row.returnNoteId === null
      ? row.uploadedBy === actor.id
      : canReadReturns(actor);
  return allowed ? ok({ content: row.content }) : notFound();
}

/** Total stored photo bytes, for the storage warning (spec system-health). */
export async function photoStorageBytes(db: Reader): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${returnPhoto.byteSize}), 0)`,
    })
    .from(returnPhoto);
  return Number(row?.total ?? 0);
}
