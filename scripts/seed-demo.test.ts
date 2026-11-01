import { describe, expect, it } from "vitest";

import type { BusinessDate } from "@/domain/business-date";

import {
  BASE_DEMO_DATE,
  canRunDemoSeed,
  computeDateOffset,
  shiftDate,
  shiftInstant,
} from "./seed-demo.mts";

describe("seed-demo logic (K9)", () => {
  describe("canRunDemoSeed guard", () => {
    it("allows execution in non-production regardless of DEMO_MODE", () => {
      expect(
        canRunDemoSeed({ NODE_ENV: "development", DEMO_MODE: false }),
      ).toEqual({ ok: true });
      expect(canRunDemoSeed({ NODE_ENV: "test", DEMO_MODE: false })).toEqual({
        ok: true,
      });
      expect(
        canRunDemoSeed({ NODE_ENV: "development", DEMO_MODE: true }),
      ).toEqual({ ok: true });
    });

    it("allows execution in production when DEMO_MODE=true", () => {
      expect(
        canRunDemoSeed({ NODE_ENV: "production", DEMO_MODE: true }),
      ).toEqual({ ok: true });
    });

    it("blocks execution in production when DEMO_MODE=false or undefined", () => {
      const res1 = canRunDemoSeed({ NODE_ENV: "production", DEMO_MODE: false });
      expect(res1.ok).toBe(false);
      if (!res1.ok) {
        expect(res1.reason).toContain("từ chối chạy ở production khi DEMO_MODE tắt");
      }

      const res2 = canRunDemoSeed({ NODE_ENV: "production", DEMO_MODE: undefined });
      expect(res2.ok).toBe(false);
    });
  });

  describe("date shifting calculations", () => {
    it("computes 0 offset when runDate equals base date", () => {
      const runDate = new Date("2026-10-28T05:00:00Z"); // Vietnam time: 12:00 28/10/2026
      expect(computeDateOffset(runDate, BASE_DEMO_DATE)).toBe(0);
    });

    it("computes positive offset when runDate is after base date", () => {
      const runDate = new Date("2026-11-01T03:00:00Z"); // Vietnam time: 10:00 01/11/2026
      // 2026-10-28 -> 2026-11-01 is 4 days
      expect(computeDateOffset(runDate, BASE_DEMO_DATE)).toBe(4);
    });

    it("shifts BusinessDate correctly", () => {
      const original = "2026-10-24" as BusinessDate;
      expect(shiftDate(original, 4)).toBe("2026-10-28");
      expect(shiftDate(original, 0)).toBe("2026-10-24");
    });

    it("shifts Instant Date correctly", () => {
      const original = new Date("2026-10-24T03:00:00Z");
      const shifted = shiftInstant(original, 4);
      expect(shifted.toISOString()).toBe("2026-10-28T03:00:00.000Z");
      expect(shifted.getTime() - original.getTime()).toBe(4 * 86_400_000);
    });
  });
});
