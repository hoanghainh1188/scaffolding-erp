import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QrDetector } from "@/lib/scan/detector";

import { QrScanner } from "./qr-scanner";

const stream = {
  getTracks: () => [{ stop: vi.fn() }],
} as unknown as MediaStream;
const camera = () => Promise.resolve(stream);

let frames: string[][] = [];
const detector: QrDetector = {
  detect: async () => frames.shift() ?? [],
};
const makeDetector = () => Promise.resolve(detector);

beforeEach(() => {
  frames = [];
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});

describe("QrScanner", () => {
  it("hands over the item code a frame carries", async () => {
    frames = [[], [" gg-k17 "]];
    const onCode = vi.fn();
    render(
      <QrScanner
        onCode={onCode}
        openCamera={camera}
        makeDetector={makeDetector}
      />,
    );
    await waitFor(() => expect(onCode).toHaveBeenCalledWith("GG-K17"));
    expect(screen.getByText("Đưa mã QR vào giữa khung")).toBeInTheDocument();
  });

  it("says when a QR code is not an item code and keeps scanning", async () => {
    frames = [["WIFI:S:Bai01;P:12345678;;"], ["GG-CH"]];
    const onCode = vi.fn();
    render(
      <QrScanner
        onCode={onCode}
        openCamera={camera}
        makeDetector={makeDetector}
      />,
    );
    expect(
      await screen.findByText("Mã QR này không phải mã hàng"),
    ).toBeInTheDocument();
    await waitFor(() => expect(onCode).toHaveBeenCalledWith("GG-CH"));
    expect(onCode).toHaveBeenCalledTimes(1);
  });

  it("explains a refused camera and still takes a typed code", async () => {
    const denied = () =>
      Promise.reject(
        Object.assign(new Error("no"), { name: "NotAllowedError" }),
      );
    const onCode = vi.fn();
    render(
      <QrScanner
        onCode={onCode}
        openCamera={denied}
        makeDetector={makeDetector}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Chưa cho phép dùng camera. Bật lại trong cài đặt trình duyệt, hoặc nhập mã.",
    );
    await userEvent.type(
      screen.getByLabelText("Không quét được? Nhập mã"),
      "gg-ch",
    );
    await userEvent.click(screen.getByRole("button", { name: "Tìm" }));
    expect(onCode).toHaveBeenCalledWith("GG-CH");
  });

  it("falls back to typing when the reader cannot load", async () => {
    render(
      <QrScanner
        onCode={vi.fn()}
        openCamera={camera}
        makeDetector={() => Promise.reject(new Error("offline"))}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Máy này không quét được mã. Nhập mã bên dưới.",
    );
  });

  it("shows a notice from the page", () => {
    render(
      <QrScanner
        onCode={vi.fn()}
        notice="GG-K15 không có trong đơn PO-2026-052"
        openCamera={camera}
        makeDetector={makeDetector}
      />,
    );
    expect(
      screen.getByText("GG-K15 không có trong đơn PO-2026-052"),
    ).toBeInTheDocument();
  });
});
