// Image type from the first bytes of a file (returns-and-compensation design
// D4): never from the file name or the Content-Type a client sends.
export type ImageType = "jpeg" | "png" | "webp";

const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  bytes.length >= at + prefix.length &&
  prefix.every((value, index) => bytes[at + index] === value);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
    return "webp";
  }
  return null;
}
