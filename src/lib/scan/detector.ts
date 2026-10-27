// QR detection for M2 and the scanner in M3 (goods-receipt design D2): the
// browser's BarcodeDetector when it reads QR codes (Chrome on Android),
// else the barcode-detector ponyfill with ZXing WebAssembly served from
// /vendor (copied by scripts/copy-zxing-wasm.mts), never from a CDN.

export interface QrDetector {
  /** Raw texts of the QR codes in the frame. */
  detect(source: HTMLVideoElement): Promise<string[]>;
}

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

export const ZXING_WASM_URL = "/vendor/zxing_reader.wasm";

function wrap(detector: NativeDetector): QrDetector {
  return {
    async detect(source) {
      const found = await detector.detect(source);
      return found.map((code) => code.rawValue);
    },
  };
}

async function nativeDetector(): Promise<QrDetector | null> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass })
    .BarcodeDetector;
  if (!Native) return null;
  const formats = (await Native.getSupportedFormats?.().catch(() => [])) ?? [];
  if (!formats.includes("qr_code")) return null;
  return wrap(new Native({ formats: ["qr_code"] }));
}

let ponyfill: Promise<QrDetector> | null = null;

/** Loads the WebAssembly reader once; M3 calls it early to work offline. */
export function loadPonyfill(): Promise<QrDetector> {
  ponyfill ??= import("barcode-detector/ponyfill").then(
    async ({ BarcodeDetector, prepareZXingModule }) => {
      await prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith(".wasm") ? ZXING_WASM_URL : prefix + path,
        },
        fireImmediately: true,
      });
      return wrap(new BarcodeDetector({ formats: ["qr_code"] }));
    },
  );
  ponyfill.catch(() => {
    ponyfill = null;
  });
  return ponyfill;
}

export async function createQrDetector(): Promise<QrDetector> {
  return (await nativeDetector()) ?? loadPonyfill();
}

/** Warm the scanner while online, so a later scan works without network. */
export function preloadQrDetector(): void {
  void createQrDetector().catch(() => undefined);
}
