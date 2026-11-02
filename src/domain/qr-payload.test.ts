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

  it("reads real codes with + , and spaces (catalog-extensions D1)", () => {
    expect(itemCodeFromQr("KB+KU34")).toBe("KB+KU34");
    expect(itemCodeFromQr(" h1,7 ")).toBe("H1,7");
    expect(itemCodeFromQr("NỐI 34")).toBe("NỐI 34");
    expect(itemCodeFromQr("https://kho.example.vn/m/scan?code=KB%2BKU34")).toBe(
      "KB+KU34",
    );
  });

  it.each([
    "WIFI:S:Bai01;P:12345678;;",
    "",
    "   ",
    "GG  K17-",
    "H1/7",
    "https://kho.example.vn/m/scan",
    "X",
    "GG-K17-QUA-DAI-QUA-DAI-QUA-DAI-QUA",
  ])("refuses %j", (raw) => {
    expect(() => itemCodeFromQr(raw)).toThrow("Mã QR này không phải mã hàng");
  });
});
