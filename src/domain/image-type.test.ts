import { describe, expect, it } from "vitest";

import { detectImageType } from "./image-type";
import {
  megabytes,
  photoStorageStatus,
  PHOTO_MESSAGES,
  PHOTO_STORAGE_WARN_BYTES,
} from "./return-photo";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "string"
        ? [...value].map((char) => char.charCodeAt(0))
        : [value],
    ),
  );

describe("detectImageType", () => {
  it("reads JPEG, PNG and WebP from their first bytes", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe(
      "jpeg",
    );
    expect(
      detectImageType(
        bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d),
      ),
    ).toBe("png");
    expect(detectImageType(bytes("RIFF", 0x24, 0, 0, 0, "WEBPVP8 "))).toBe(
      "webp",
    );
  });

  it("refuses a PDF named .jpg, a RIFF that is not WebP, short files", () => {
    expect(detectImageType(bytes("%PDF-1.7"))).toBeNull();
    expect(
      detectImageType(bytes("RIFF", 0x24, 0, 0, 0, "WAVEfmt ")),
    ).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull();
  });
});

describe("photo storage", () => {
  it("warns above 200 MB", () => {
    expect(photoStorageStatus(PHOTO_STORAGE_WARN_BYTES - 1)).toBe("ok");
    expect(photoStorageStatus(PHOTO_STORAGE_WARN_BYTES + 1)).toBe("warning");
    expect(PHOTO_MESSAGES.storageWarning(megabytes(210 * 1024 * 1024))).toBe(
      "Ảnh thu hồi đang dùng 210 MB, vượt ngưỡng 200 MB. Cần chuyển ảnh sang kho riêng trước khi cơ sở dữ liệu đầy.",
    );
  });
});
