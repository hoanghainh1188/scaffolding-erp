// Where the CCCD retention period starts (0.2 số 166, review PR #176 item 5).
import { describe, expect, it } from "vitest";

import { retentionAnchor } from "./purge";

const CREATED = new Date("2015-06-01T03:00:00Z");

describe("retentionAnchor", () => {
  it("takes a CCCD typed in again after the last receipt", () => {
    expect(
      retentionAnchor("2026-03-05", new Date("2036-10-31T17:30:00Z"), CREATED),
    ).toBe("2036-11-01");
  });

  it("takes a receipt after the CCCD was saved", () => {
    expect(
      retentionAnchor("2030-02-01", new Date("2026-01-10T03:00:00Z"), CREATED),
    ).toBe("2030-02-01");
  });

  it("takes the receipt when the saving day is unknown", () => {
    expect(retentionAnchor("2026-03-05", null, CREATED)).toBe("2026-03-05");
  });

  it("takes the Vietnamese creation day when nothing else is known", () => {
    expect(retentionAnchor(null, null, new Date("2026-11-09T17:30:00Z"))).toBe(
      "2026-11-10",
    );
  });
});
