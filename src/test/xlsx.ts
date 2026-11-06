// Reads back a workbook written by buildXlsxBook (tests only): file name →
// XML text.
import { inflateRawSync } from "node:zlib";

export function unzipXlsx(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes);
  const endAt = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(endAt + 10);
  let offset = buffer.readUInt32LE(endAt + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i += 1) {
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26);
    files.set(
      name,
      inflateRawSync(buffer.subarray(start, start + size)).toString("utf8"),
    );
    offset += 46 + nameLength;
  }
  return files;
}

/** Rows of a sheet, header included. */
export const rowCount = (sheet: string): number =>
  sheet.match(/<row /g)?.length ?? 0;
