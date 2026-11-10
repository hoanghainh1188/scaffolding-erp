import { describe, expect, it } from "vitest";

import {
  CURRENT_NOTICE_VERSION,
  ID_NUMBER_RETENTION_YEARS,
  PERSONAL_DATA_NOTICES,
  anonymizedSellerName,
  idNumberRetainedUntil,
  needsDataNotice,
  renderDataNotice,
  sellerLabel,
} from "./personal-data";

// Written out by hand: a used version must never change.
const VERSION_ONE =
  "{companyName} lưu các thông tin sau của ông/bà: họ tên, số điện thoại, địa chỉ, số CCCD, tên ngân hàng và 4 số cuối tài khoản. Mục đích: liên hệ mua bán, thanh toán tiền hàng và lập chứng từ thuế (bảng kê thu mua không có hóa đơn). Số CCCD được mã hóa, chỉ nhân viên được giao việc mới xem được số đầy đủ. Dữ liệu lưu trên máy chủ đặt tại Singapore, trong 10 năm kể từ lần mua gần nhất. Ông/bà có quyền yêu cầu xem, sửa hoặc xóa, liên hệ {companyPhone}.";

describe("data notice wording", () => {
  it("keeps version 1 word for word", () => {
    expect(PERSONAL_DATA_NOTICES[1]).toBe(VERSION_ONE);
    expect(CURRENT_NOTICE_VERSION).toBe(1);
  });

  it.each([
    "họ tên",
    "số điện thoại",
    "địa chỉ",
    "số CCCD",
    "tên ngân hàng",
    "4 số cuối tài khoản",
    "Singapore",
  ])("names %s", (phrase) => {
    expect(PERSONAL_DATA_NOTICES[1]).toContain(phrase);
  });

  it("fills in the company from settings", () => {
    const text = renderDataNotice(1, {
      companyName: "An Phát",
      companyPhone: "0243123456",
    });
    expect(text?.startsWith("An Phát lưu")).toBe(true);
    expect(text?.endsWith("liên hệ 0243123456.")).toBe(true);
  });

  it("returns null for a version that does not exist", () => {
    expect(
      renderDataNotice(99, { companyName: "A", companyPhone: "1" }),
    ).toBeNull();
  });
});

describe("needsDataNotice", () => {
  it.each([
    ["a person with only a name", "PERSON", {}, false],
    [
      "a person with empty fields",
      "PERSON",
      { phone: " ", address: null },
      false,
    ],
    ["a person with a phone", "PERSON", { phone: "0912345678" }, true],
    ["a person with an address", "PERSON", { address: "Hà Đông" }, true],
    ["a person with an account", "PERSON", { bankAccountLast4: "5678" }, true],
    ["a person with a bank", "PERSON", { bankName: "Vietcombank" }, true],
    ["a person with a CCCD", "PERSON", { idNumber: "001203012345" }, true],
    ["a company with a phone", "COMPANY", { phone: "0243123456" }, false],
    ["a company with a CCCD", "COMPANY", { idNumber: "001203012345" }, true],
  ])("%s", (_name, kind, values, expected) => {
    expect(needsDataNotice(kind, values)).toBe(expected);
  });
});

describe("idNumberRetainedUntil", () => {
  it("adds the years", () => {
    expect(ID_NUMBER_RETENTION_YEARS).toBe(10);
    expect(idNumberRetainedUntil("2026-03-05")).toBe("2036-03-05");
  });

  it("ends on the last day of February when the day does not exist", () => {
    expect(idNumberRetainedUntil("2028-02-29")).toBe("2038-02-28");
  });

  it("keeps 29 February when the target year has it", () => {
    expect(idNumberRetainedUntil("2028-02-29", 4)).toBe("2032-02-29");
  });

  it("follows the parameter", () => {
    expect(idNumberRetainedUntil("2026-03-05", 5)).toBe("2031-03-05");
  });
});

describe("sellerLabel", () => {
  it("writes a person by code", () => {
    expect(
      sellerLabel({ kind: "PERSON", code: "NCC-0004", name: "Anh Tâm" }),
    ).toBe("NCC-0004");
  });

  it("writes a company by name", () => {
    expect(
      sellerLabel({ kind: "COMPANY", code: "NCC-0001", name: "Hòa Phát" }),
    ).toBe("Hòa Phát");
  });
});

describe("anonymizedSellerName", () => {
  it("keeps only the code", () => {
    expect(anonymizedSellerName("NCC-0004")).toBe("Đã ẩn danh (NCC-0004)");
  });
});
