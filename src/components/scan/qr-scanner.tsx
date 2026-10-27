"use client";

// Camera QR scanner with a typed-code fallback (goods-receipt spec
// item-scan, design D2). Reads 5 frames a second from the back camera.
import { Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DomainValueError } from "@/domain/errors";
import { normalizeCatalogCode } from "@/domain/item-code";
import { itemCodeFromQr } from "@/domain/qr-payload";
import { createQrDetector, type QrDetector } from "@/lib/scan/detector";

export const SCAN_INTERVAL_MS = 200;
/** The same label held in front of the camera counts again after this. */
export const SAME_CODE_PAUSE_MS = 2000;

export const SCAN_MESSAGES = {
  denied:
    "Chưa cho phép dùng camera. Bật lại trong cài đặt trình duyệt, hoặc nhập mã.",
  unavailable: "Máy này không quét được mã. Nhập mã bên dưới.",
  aim: "Đưa mã QR vào giữa khung",
} as const;

type CameraState = "starting" | "scanning" | "denied" | "unavailable";

export interface QrScannerProps {
  /** An item code, from a scan or typed in. */
  onCode: (code: string) => void;
  /** A message under the frame, e.g. "GG-K15 không có trong đơn …". */
  notice?: string | null;
  /** Tests and stories inject these. */
  openCamera?: () => Promise<MediaStream>;
  makeDetector?: () => Promise<QrDetector>;
}

const backCamera = () =>
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });

export function QrScanner({
  onCode,
  notice,
  openCamera = backCamera,
  makeDetector = createQrDetector,
}: QrScannerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const handler = useRef(onCode);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [warning, setWarning] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    handler.current = onCode;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    let last = "";
    let lastAt = 0;
    void (async () => {
      try {
        stream = await openCamera();
      } catch (error: unknown) {
        if (stopped) return;
        const name = (error as { name?: string } | null)?.name;
        setCamera(name === "NotAllowedError" ? "denied" : "unavailable");
        return;
      }
      let detector: QrDetector;
      try {
        detector = await makeDetector();
      } catch {
        if (!stopped) setCamera("unavailable");
        return;
      }
      if (stopped) return;
      const element = video.current;
      if (element) {
        element.srcObject = stream;
        await element.play().catch(() => undefined);
      }
      setCamera("scanning");
      let busy = false;
      timer = setInterval(async () => {
        if (busy || !video.current) return;
        busy = true;
        try {
          const [raw] = await detector.detect(video.current);
          const now = Date.now();
          if (
            raw !== undefined &&
            (raw !== last || now - lastAt > SAME_CODE_PAUSE_MS)
          ) {
            last = raw;
            lastAt = now;
            try {
              const code = itemCodeFromQr(raw);
              setWarning(null);
              handler.current(code);
            } catch (error: unknown) {
              if (!(error instanceof DomainValueError)) throw error;
              setWarning(error.message);
            }
          }
        } catch {
          // A frame the detector could not read; try the next one.
        } finally {
          busy = false;
        }
      }, SCAN_INTERVAL_MS);
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [openCamera, makeDetector]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const code = normalizeCatalogCode(typed);
    if (code) onCode(code);
  }

  const blocked = camera === "denied" || camera === "unavailable";
  return (
    <div className="flex flex-col gap-4">
      {blocked ? (
        <p role="alert" className="rounded-lg border bg-card p-4 text-body">
          {camera === "denied"
            ? SCAN_MESSAGES.denied
            : SCAN_MESSAGES.unavailable}
        </p>
      ) : (
        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-foreground">
          <video
            ref={video}
            muted
            playsInline
            aria-label="Khung quét mã"
            className="size-full object-cover"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[18%] rounded-lg border-4 border-card"
          />
          <p className="absolute inset-x-0 bottom-3 text-center text-label text-card">
            {SCAN_MESSAGES.aim}
          </p>
        </div>
      )}
      {(warning ?? notice) && (
        <p role="status" className="text-label text-destructive">
          {warning ?? notice}
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="scan-code" className="text-label">
          Không quét được? Nhập mã
        </label>
        <div className="flex gap-2">
          <Input
            id="scan-code"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="VD GG-K17"
            className="h-12"
          />
          <Button type="submit" className="h-12 min-w-24">
            <Search aria-hidden className="size-4" />
            Tìm
          </Button>
        </div>
      </form>
    </div>
  );
}
