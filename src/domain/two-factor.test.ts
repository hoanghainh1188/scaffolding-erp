import { describe, expect, it } from "vitest";

import {
  canManageTwoFactor,
  canOpenUsers,
  canResetOthersTwoFactor,
} from "./permissions";
import {
  classifyCode,
  formatBackupCode,
  isTwoFactorRequired,
  normalizeBackupCode,
  relabelTotpUri,
  secretTextOf,
} from "./two-factor";

const plain = (role: Parameters<typeof isTwoFactorRequired>[0]["role"]) => ({
  role,
  systemAdmin: false,
});

describe("isTwoFactorRequired", () => {
  it.each(["DIRECTOR", "ACCOUNTANT"] as const)("requires it for %s", (role) => {
    expect(isTwoFactorRequired(plain(role), false)).toBe(true);
  });

  it.each(["SALES", "WAREHOUSE", "WORKSHOP"] as const)(
    "does not require it for %s",
    (role) => {
      expect(isTwoFactorRequired(plain(role), false)).toBe(false);
    },
  );

  it.each(["DIRECTOR", "ACCOUNTANT"] as const)(
    "does not require it for %s in demo mode",
    (role) => {
      expect(isTwoFactorRequired(plain(role), true)).toBe(false);
    },
  );

  it("requires it for a system admin of any role", () => {
    expect(
      isTwoFactorRequired({ role: "SALES", systemAdmin: true }, false),
    ).toBe(true);
  });
});

describe("account flag permissions", () => {
  it("lets a flagged SALES account manage its own second factor", () => {
    expect(canManageTwoFactor({ role: "SALES", systemAdmin: true })).toBe(true);
    expect(canManageTwoFactor(plain("SALES"))).toBe(false);
  });

  it("does not let a director without the flag reset others", () => {
    expect(canResetOthersTwoFactor(plain("DIRECTOR"))).toBe(false);
    expect(canResetOthersTwoFactor({ role: "SALES", systemAdmin: true })).toBe(
      true,
    );
  });

  it("opens D17 for directors and flagged accounts only", () => {
    expect(canOpenUsers(plain("DIRECTOR"))).toBe(true);
    expect(canOpenUsers({ role: "SALES", systemAdmin: true })).toBe(true);
    expect(canOpenUsers(plain("ACCOUNTANT"))).toBe(false);
  });
});

describe("normalizeBackupCode", () => {
  it("ignores case, spaces and hyphens", () => {
    expect(normalizeBackupCode("3jw8 r2nb f7vc q5ky")).toBe("3JW8R2NBF7VCQ5KY");
    expect(normalizeBackupCode("3JW8-R2NB-F7VC-Q5KY")).toBe("3JW8R2NBF7VCQ5KY");
  });

  it("reads look-alike letters as digits", () => {
    expect(normalizeBackupCode("OOOO-IIII-LLLL-2222")).toBe("0000111111112222");
  });

  it("rejects wrong lengths and letters outside the alphabet", () => {
    expect(normalizeBackupCode("12345")).toBeNull();
    expect(normalizeBackupCode("")).toBeNull();
    expect(normalizeBackupCode("UUUU-UUUU-UUUU-UUUU")).toBeNull();
  });
});

describe("formatBackupCode", () => {
  it("groups by four", () => {
    expect(formatBackupCode("3JW8R2NBF7VCQ5KY")).toBe("3JW8-R2NB-F7VC-Q5KY");
  });
});

describe("classifyCode", () => {
  it("treats six digits as an app code", () => {
    expect(classifyCode("492817")).toEqual({ kind: "TOTP", code: "492817" });
    expect(classifyCode(" 492 817 ")).toEqual({ kind: "TOTP", code: "492817" });
  });

  it("treats a well-formed longer code as a backup code", () => {
    expect(classifyCode("7kq2-m9xa-p4tr-h6zd")).toEqual({
      kind: "BACKUP",
      code: "7KQ2M9XAP4TRH6ZD",
    });
  });

  it("rejects anything else", () => {
    expect(classifyCode("12345")).toBeNull();
    expect(classifyCode("")).toBeNull();
    expect(classifyCode("abc")).toBeNull();
  });
});

describe("TOTP URI helpers", () => {
  const uri =
    "otpauth://totp/Scaffolding%20ERP:giamdoc%40users.invalid?secret=JBSWY3DPEHPK3PXP&issuer=Scaffolding%20ERP&digits=6&period=30";

  it("relabels without touching the secret or timing", () => {
    const relabeled = relabelTotpUri(uri, "An Phát", "minhanh");
    expect(relabeled.startsWith("otpauth://totp/An%20Ph%C3%A1t:minhanh?")).toBe(
      true,
    );
    const query = new URLSearchParams(relabeled.split("?")[1]);
    expect(query.get("secret")).toBe("JBSWY3DPEHPK3PXP");
    expect(query.get("issuer")).toBe("An Phát");
    expect(query.get("digits")).toBe("6");
    expect(query.get("period")).toBe("30");
  });

  it("splits the secret into groups of four", () => {
    expect(secretTextOf(uri)).toBe("JBSW Y3DP EHPK 3PXP");
  });
});
