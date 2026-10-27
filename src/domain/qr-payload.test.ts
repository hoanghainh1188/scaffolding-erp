import { describe, expect, it } from "vitest";

import { itemCodeFromQr } from "./qr-payload";

describe("itemCodeFromQr", () => {
  it("reads a bare item code, any case, with spaces around", () => {
    expect(itemCodeFromQr(" gg-k17 ")).toBe("GG-K17");
    expect(itemCodeFromQr("PL-SAT")).toBe("PL-SAT");
  });

  it("reads the code parameter of a link", () => {
    expect(itemCodeFromQr("https://kho.example.vn/m/scan?code=GG-K17")).toBe(
      "GG-K17",
    );
    expect(itemCodeFromQr("http://localhost:3000/m/scan?code=gg-ch")).toBe(
      "GG-CH",
    );
  });

  it.each([
    "WIFI:S:Bai01;P:12345678;;",
    "",
    "   ",
    "GG K17",
    "https://kho.example.vn/m/scan",
    "X",
    "GG-K17-QUA-DAI-QUA-DAI-QUA",
  ])("refuses %j", (raw) => {
    expect(() => itemCodeFromQr(raw)).toThrow("Mã QR này không phải mã hàng");
  });
});
