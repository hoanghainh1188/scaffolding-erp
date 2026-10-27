export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_MESSAGES = {
  tooShort: `Mật khẩu mới phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`,
  tooLong: `Mật khẩu mới dài tối đa ${PASSWORD_MAX_LENGTH} ký tự`,
  sameAsUsername: "Mật khẩu mới không được trùng tên đăng nhập",
  sameAsCurrent: "Mật khẩu mới phải khác mật khẩu hiện tại",
  common: "Mật khẩu này quá dễ đoán, chọn mật khẩu khác",
  mismatch: "Hai ô mật khẩu mới chưa khớp nhau",
} as const;

// Most-guessed passwords, including Vietnamese habits. Compared ignoring case.
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "0123456789",
  "87654321",
  "11111111",
  "00000000",
  "88888888",
  "66666666",
  "99999999",
  "12341234",
  "11223344",
  "12121212",
  "123123123",
  "1qaz2wsx",
  "password",
  "password1",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "qwerty123",
  "qwertyui",
  "qwerty12",
  "asdfghjk",
  "zxcvbnm1",
  "abc12345",
  "abcd1234",
  "abc123456",
  "a1234567",
  "aa123456",
  "iloveyou",
  "admin123",
  "administrator",
  "welcome1",
  "letmein1",
  "matkhau",
  "matkhau1",
  "matkhau12",
  "matkhau123",
  "matkhau@123",
  "matkhaumoi",
  "khongbiet",
  "anhyeuem",
  "emyeuanh",
  "yeuemmaimai",
  "vietnam1",
  "vietnam123",
  "hanoi123",
  "saigon123",
  "conyeume",
  "123456aa",
  "123456ab",
  "123456abc",
  "1234qwer",
  "qwer1234",
  "giangiao",
  "giangiao1",
  "giangiao123",
  "congty123",
  "nhanvien",
  "nhanvien1",
  "thukho123",
  "ketoan123",
  "giamdoc123",
  "kinhdoanh",
]);

export interface NewPasswordInput {
  password: string;
  confirm: string;
  username: string;
  currentPassword: string;
}

export type PasswordCheck = { ok: true } | { ok: false; error: string };

/** Rules for a password a user picks themselves (design D2). */
export function validateNewPassword(input: NewPasswordInput): PasswordCheck {
  const { password } = input;
  // Count characters, not UTF-16 units: "giàn" is 4 whatever its encoding.
  const length = [...password.normalize("NFC")].length;
  const folded = password.toLowerCase();

  if (length < PASSWORD_MIN_LENGTH) return fail(PASSWORD_MESSAGES.tooShort);
  if (length > PASSWORD_MAX_LENGTH) return fail(PASSWORD_MESSAGES.tooLong);
  if (folded === input.username.toLowerCase()) {
    return fail(PASSWORD_MESSAGES.sameAsUsername);
  }
  if (password === input.currentPassword) {
    return fail(PASSWORD_MESSAGES.sameAsCurrent);
  }
  if (COMMON_PASSWORDS.has(folded)) return fail(PASSWORD_MESSAGES.common);
  if (password !== input.confirm) return fail(PASSWORD_MESSAGES.mismatch);
  return { ok: true };
}

function fail(error: string): PasswordCheck {
  return { ok: false, error };
}
