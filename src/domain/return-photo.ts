// Return photos (returns-and-compensation design D4, 0.2 #65): the size and
// count limits, the stored format and the storage warning threshold, kept in
// one place (0.2 #33 rule 5).
const MB = 1024 * 1024;

/** A photo sent from the phone; under Vercel's 4,5 MB request body. */
export const PHOTO_MAX_UPLOAD_BYTES = 4 * MB;
export const PHOTO_MAX_PER_NOTE = 6;
/** Longest edge, phone resize and server re-encode alike. */
export const PHOTO_MAX_EDGE = 1280;
export const PHOTO_QUALITY = 70;
/** Refuse images that would decode to more pixels than this ("bombs"). */
export const PHOTO_MAX_INPUT_PIXELS = 40_000_000;
export const PHOTO_CAPTION_MAX = 100;
/** Draft photos never attached to a note are cleaned after this. */
export const PHOTO_DRAFT_TTL_DAYS = 7;
/** Neon Free has 0,5 GB for the whole database. */
export const PHOTO_STORAGE_WARN_BYTES = 200 * MB;

export type PhotoStorageStatus = "ok" | "warning";

export function photoStorageStatus(totalBytes: number): PhotoStorageStatus {
  return totalBytes > PHOTO_STORAGE_WARN_BYTES ? "warning" : "ok";
}

/** "210 MB", rounded down. */
export const megabytes = (bytes: number): number => Math.floor(bytes / MB);

export const PHOTO_MESSAGES = {
  notImage: "File này không phải ảnh JPEG, PNG hoặc WebP.",
  tooLarge: "Ảnh lớn hơn 4 MB. Chụp lại hoặc chọn ảnh nhỏ hơn.",
  tooMany: `Mỗi phiếu thu hồi có tối đa ${PHOTO_MAX_PER_NOTE} ảnh.`,
  tooManyOnPhone: `Mỗi phiếu thu hồi có tối đa ${PHOTO_MAX_PER_NOTE} ảnh. Xóa bớt ảnh nếu cần chụp thêm.`,
  unreadable: "Không đọc được ảnh này. Chụp lại ảnh khác.",
  captionLong: `Chú thích tối đa ${PHOTO_CAPTION_MAX} ký tự.`,
  expired: "Một số ảnh chờ gửi đã hết hạn trên máy chủ. Máy sẽ gửi lại ảnh.",
  storageWarning: (usedMb: number) =>
    `Ảnh thu hồi đang dùng ${usedMb} MB, vượt ngưỡng ${megabytes(PHOTO_STORAGE_WARN_BYTES)} MB. Cần chuyển ảnh sang kho riêng trước khi cơ sở dữ liệu đầy.`,
} as const;
