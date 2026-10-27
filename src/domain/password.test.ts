import { describe, expect, it } from "vitest";

import { PASSWORD_MESSAGES, validateNewPassword } from "./password";

const base = {
  username: "ducluc",
  currentPassword: "giao-7342",
};

const check = (password: string, confirm = password) =>
  validateNewPassword({ ...base, password, confirm });

describe("validateNewPassword", () => {
  it("rejects 6 characters", () => {
    expect(check("kho123")).toEqual({
      ok: false,
      error: "Mật khẩu mới phải có ít nhất 8 ký tự",
    });
  });

  it("accepts exactly 8 characters", () => {
    expect(check("khoxe-91")).toEqual({ ok: true });
  });

  it("counts Vietnamese letters as one character each", () => {
    // 8 letters, more than 8 UTF-16 units once decomposed.
    expect(check("giàngiáo".normalize("NFD"))).toEqual({ ok: true });
  });

  it("accepts 128 characters and rejects 129", () => {
    expect(check("a1".repeat(64))).toEqual({ ok: true });
    expect(check(`${"a1".repeat(64)}x`)).toEqual({
      ok: false,
      error: PASSWORD_MESSAGES.tooLong,
    });
  });

  it("rejects the login name, in any case", () => {
    expect(
      validateNewPassword({
        username: "thuha.ketoan",
        currentPassword: "old-pass-1",
        password: "ThuHa.KeToan",
        confirm: "ThuHa.KeToan",
      }),
    ).toEqual({ ok: false, error: PASSWORD_MESSAGES.sameAsUsername });
  });

  it("rejects the current temporary password", () => {
    expect(check("giao-7342")).toEqual({
      ok: false,
      error: "Mật khẩu mới phải khác mật khẩu hiện tại",
    });
  });

  it.each(["12345678", "password", "MatKhau123", "matkhau123", "11111111"])(
    "rejects the common password %s",
    (password) => {
      expect(check(password)).toEqual({
        ok: false,
        error: "Mật khẩu này quá dễ đoán, chọn mật khẩu khác",
      });
    },
  );

  it("accepts a phrase with spaces and no symbols", () => {
    expect(check("bai sau kho")).toEqual({ ok: true });
  });

  it("rejects a confirmation that does not match", () => {
    expect(check("bai sau kho", "bai sau kh0")).toEqual({
      ok: false,
      error: PASSWORD_MESSAGES.mismatch,
    });
  });
});
