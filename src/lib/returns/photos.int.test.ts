// Return photos (return-photos spec, tasks 3.6): type by content, size and
// count limits, EXIF removed, private reads, draft clean-up and the photos a
// posted note needs.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { returnPhoto } from "@/db/schema";
import { createTestContext } from "@/test/auth";
import {
  returnOf,
  setupReturnFixture,
  type ReturnFixture,
} from "@/test/returns";

import {
  photoStorageBytes,
  readReturnPhoto,
  uploadReturnPhoto,
} from "./photos";

const ctx = createTestContext();
afterAll(ctx.close);

let fx: ReturnFixture;
beforeEach(async () => {
  fx = await setupReturnFixture(ctx);
});

/** A JPEG made here, with camera EXIF (make, model, GPS). */
async function jpeg(width = 640, height = 480): Promise<Uint8Array> {
  return sharp({
    create: { width, height, channels: 3, background: "#7a8b9c" },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: "PhoneMaker", Model: "Model X" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "21/1 1/1 0/1" },
    })
    .toBuffer();
}

const upload = (
  bytes: Uint8Array,
  draftId: string,
  options: {
    clientPhotoId?: string;
    actor?: ReturnFixture["warehouse"];
    now?: Date;
  } = {},
) =>
  uploadReturnPhoto(
    ctx.db,
    options.actor ?? fx.warehouse,
    {
      draftId,
      clientPhotoId: options.clientPhotoId ?? randomUUID(),
      caption: "Khung móp chân",
      bytes,
    },
    { now: options.now },
  );

async function stored(id: string) {
  const [row] = await ctx.db
    .select()
    .from(returnPhoto)
    .where(eq(returnPhoto.id, id));
  return row;
}

describe("uploadReturnPhoto", () => {
  it("re-encodes to WebP without EXIF, shrunk to 1.280 px", async () => {
    const result = await upload(await jpeg(3000, 4000), randomUUID());
    if (!result.ok) throw new Error(result.error);
    expect(result.data).toMatchObject({ width: 960, height: 1280 });
    const row = await stored(result.data.id);
    const meta = await sharp(row?.content).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(row?.byteSize).toBe(row?.content.byteLength);
  });

  it("refuses a PDF sent as a JPEG, and a broken JPEG", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 not an image at all");
    expect(await upload(pdf, randomUUID())).toMatchObject({
      ok: false,
      status: 400,
      error: "File này không phải ảnh JPEG, PNG hoặc WebP.",
    });
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
    expect(await upload(broken, randomUUID())).toMatchObject({
      ok: false,
      status: 400,
      error: "Không đọc được ảnh này. Chụp lại ảnh khác.",
    });
    expect(await ctx.db.select().from(returnPhoto)).toHaveLength(0);
  });

  it("refuses a photo above 4 MB", async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(await upload(big, randomUUID())).toMatchObject({
      ok: false,
      status: 413,
      error: "Ảnh lớn hơn 4 MB. Chụp lại hoặc chọn ảnh nhỏ hơn.",
    });
  });

  it("refuses the seventh photo of a draft, keeps resends single", async () => {
    const draftId = randomUUID();
    const bytes = await jpeg();
    const photoId = randomUUID();
    const first = await upload(bytes, draftId, { clientPhotoId: photoId });
    const again = await upload(bytes, draftId, { clientPhotoId: photoId });
    expect(again.ok && first.ok && again.data.id === first.data.id).toBe(true);
    for (let index = 0; index < 5; index += 1) {
      expect((await upload(bytes, draftId)).ok).toBe(true);
    }
    expect(await upload(bytes, draftId)).toMatchObject({
      ok: false,
      error: "Mỗi phiếu thu hồi có tối đa 6 ảnh.",
    });
  });

  it("is for those who receive returns", async () => {
    expect(
      await upload(await jpeg(), randomUUID(), { actor: fx.sales }),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("cleans draft photos older than 7 days, keeps younger ones", async () => {
    const bytes = await jpeg();
    const old = await upload(bytes, randomUUID(), {
      now: new Date("2026-10-28T00:00:00Z"),
    });
    const young = await upload(bytes, randomUUID(), {
      now: new Date("2026-10-31T00:00:00Z"),
    });
    await upload(bytes, randomUUID(), {
      now: new Date("2026-11-05T01:00:00Z"),
    });
    expect(old.ok && (await stored(old.data.id))).toBeFalsy();
    expect(young.ok && (await stored(young.data.id))).toBeTruthy();
  });
});

describe("posting with photos", () => {
  it("attaches the draft photos in order", async () => {
    const draftId = randomUUID();
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const result = await upload(await jpeg(), draftId);
      if (result.ok) ids.push(result.data.id);
    }
    const posted = await returnOf(
      ctx,
      fx,
      { "GG-CH": [5, 0, 0, 0] },
      { draftId, body: { photoIds: ids } },
    );
    expect(posted.ok).toBe(true);
    const rows = await ctx.db.select().from(returnPhoto);
    expect(
      rows.sort((a, b) => a.position - b.position).map((row) => row.id),
    ).toEqual(ids);
    expect(rows.every((row) => row.returnNoteId !== null)).toBe(true);
  });

  it("answers PHOTOS_EXPIRED for a photo cleaned away, posting nothing", async () => {
    const draftId = randomUUID();
    const kept = await upload(await jpeg(), draftId);
    const gone = randomUUID();
    const result = await returnOf(
      ctx,
      fx,
      { "GG-CH": [5, 0, 0, 0] },
      { draftId, body: { photoIds: [kept.ok ? kept.data.id : "", gone] } },
    );
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      details: { code: "PHOTOS_EXPIRED", expiredPhotoIds: [gone] },
    });
    const { returnNote } = await import("@/db/schema");
    expect(await ctx.db.select().from(returnNote)).toHaveLength(0);
    // Sent again from the phone, then saved: one note with both photos.
    const resent = await upload(await jpeg(), draftId);
    const saved = await returnOf(
      ctx,
      fx,
      { "GG-CH": [5, 0, 0, 0] },
      {
        draftId,
        body: {
          photoIds: [
            kept.ok ? kept.data.id : "",
            resent.ok ? resent.data.id : "",
          ],
        },
      },
    );
    expect(saved.ok).toBe(true);
  });
});

describe("readReturnPhoto", () => {
  async function postedPhoto() {
    const draftId = randomUUID();
    const result = await upload(await jpeg(), draftId);
    if (!result.ok) throw new Error(result.error);
    await returnOf(
      ctx,
      fx,
      { "GG-CH": [5, 0, 0, 0] },
      { draftId, body: { photoIds: [result.data.id] } },
    );
    return result.data.id;
  }

  it("serves a posted photo to office readers and the storekeeper", async () => {
    const id = await postedPhoto();
    expect((await readReturnPhoto(ctx.db, fx.accountant, id)).ok).toBe(true);
    expect((await readReturnPhoto(ctx.db, fx.director, id)).ok).toBe(true);
    expect((await readReturnPhoto(ctx.db, fx.warehouse, id)).ok).toBe(true);
  });

  it("answers 404 to a sale-only seller and the workshop", async () => {
    const id = await postedPhoto();
    const seller = await fx.seller("thuyvy", "SALE");
    expect(await readReturnPhoto(ctx.db, seller, id)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(
      await readReturnPhoto(ctx.db, { ...fx.warehouse, role: "WORKSHOP" }, id),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("shows a draft photo to its uploader only", async () => {
    const result = await upload(await jpeg(), randomUUID());
    if (!result.ok) throw new Error(result.error);
    expect(
      (await readReturnPhoto(ctx.db, fx.warehouse, result.data.id)).ok,
    ).toBe(true);
    expect(
      await readReturnPhoto(ctx.db, fx.director, result.data.id),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("adds up the stored bytes", async () => {
    const result = await upload(await jpeg(), randomUUID());
    const row = result.ok ? await stored(result.data.id) : undefined;
    expect(await photoStorageBytes(ctx.db)).toBe(row?.byteSize);
  });
});
