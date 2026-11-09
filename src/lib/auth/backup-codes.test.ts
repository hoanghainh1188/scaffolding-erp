import { describe, expect, it } from "vitest";

import { BACKUP_CODE_COUNT } from "@/domain/two-factor";

import {
  generateBackupCodes,
  hashBackupCode,
  hashedBackupCodeStore,
} from "./backup-codes";

describe("generateBackupCodes", () => {
  it("makes 10 distinct codes in display form", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(
        /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/,
      );
    }
  });
});

describe("hashBackupCode", () => {
  it("gives one hash for every way of typing a code", () => {
    expect(hashBackupCode("3jw8 r2nb f7vc q5ky")).toBe(
      hashBackupCode("3JW8-R2NB-F7VC-Q5KY"),
    );
  });

  it("leaves a hash unchanged", () => {
    const once = hashBackupCode("3JW8-R2NB-F7VC-Q5KY");
    expect(hashBackupCode(once)).toBe(once);
  });
});

describe("hashedBackupCodeStore", () => {
  const codes = ["3JW8-R2NB-F7VC-Q5KY", "7KQ2-M9XA-P4TR-H6ZD"];

  it("stores no plain code", async () => {
    const stored = await hashedBackupCodeStore.encrypt(JSON.stringify(codes));
    for (const code of codes) {
      expect(stored).not.toContain(code);
      expect(stored).not.toContain(code.replaceAll("-", ""));
    }
  });

  it("keeps a stored list as it is when written back", async () => {
    const stored = await hashedBackupCodeStore.encrypt(JSON.stringify(codes));
    expect(await hashedBackupCodeStore.encrypt(stored)).toBe(stored);
    expect(await hashedBackupCodeStore.decrypt(stored)).toBe(stored);
  });
});
