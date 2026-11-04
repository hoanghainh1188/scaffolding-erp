import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import {
  buildPieces,
  transferOrigins,
  type EndKind,
  type RentalEvent,
} from "./rental-lots";

const d = (value: string) => value as BusinessDate;
let order = 0;

const delivered = (
  code: string,
  date: string,
  pieces: number,
  item = "H1,7",
): RentalEvent => ({
  itemId: item,
  direction: "IN",
  milli: pieces * 1000,
  date: d(date),
  order: ++order,
  doc: { type: "DELIVERY_NOTE", id: code, code },
});

const left = (
  code: string,
  date: string,
  pieces: number,
  endKind: EndKind = "RETURN",
  extra: Partial<RentalEvent> = {},
): RentalEvent => ({
  itemId: "H1,7",
  direction: "OUT",
  milli: pieces * 1000,
  date: d(date),
  order: ++order,
  doc: { type: "RETURN_NOTE", id: code, code },
  endKind,
  ...extra,
});

describe("buildPieces (0.2 #77: earliest lot first)", () => {
  it("draws a partial return from the earliest delivery", () => {
    const pieces = buildPieces([
      delivered("PX-2026-001", "2026-11-01", 100),
      delivered("PX-2026-004", "2026-11-10", 50),
      left("PTH-2026-010", "2026-11-20", 120),
    ]);
    expect(
      pieces.map((piece) => [
        piece.inDoc.code,
        piece.milli / 1000,
        piece.end?.date ?? null,
      ]),
    ).toEqual([
      ["PX-2026-001", 100, "2026-11-20"],
      ["PX-2026-004", 20, "2026-11-20"],
      ["PX-2026-004", 30, null],
    ]);
  });

  it("orders two deliveries of one day by document code", () => {
    const pieces = buildPieces([
      delivered("PX-2026-009", "2026-11-01", 10),
      delivered("PX-2026-002", "2026-11-01", 10),
      left("PTH-1", "2026-11-20", 10),
    ]);
    expect(pieces[0]?.inDoc.code).toBe("PX-2026-002");
    expect(pieces[0]?.end?.date).toBe("2026-11-20");
  });

  it("keeps items apart", () => {
    const pieces = buildPieces([
      delivered("PX-1", "2026-11-01", 10, "H1,7"),
      delivered("PX-1", "2026-11-01", 5, "KU0,5"),
      left("PTH-1", "2026-11-20", 10),
    ]);
    expect(pieces.find((piece) => piece.itemId === "KU0,5")?.end).toBeNull();
  });

  it("leaves no piece when everything came back", () => {
    const pieces = buildPieces([
      delivered("PX-1", "2026-10-01", 100),
      left("PTH-1", "2026-10-31", 100),
    ]);
    expect(pieces.filter((piece) => piece.end === null)).toEqual([]);
  });

  it("applies the minimum to returns and buy-backs, not to losses (0.2 #76)", () => {
    const pieces = buildPieces([
      delivered("PX-1", "2026-11-01", 30),
      left("PTH-1", "2026-11-10", 10),
      left("PTH-1", "2026-11-10", 10, "LOSS"),
      left("MLA-1", "2026-11-12", 10, "BUY_BACK"),
    ]);
    expect(
      pieces.map((piece) => [piece.end?.kind, piece.end?.minimumApplies]),
    ).toEqual([
      ["RETURN", true],
      ["LOSS", false],
      ["BUY_BACK", true],
    ]);
  });

  it("exempts a return on the delivery day (0.2 #76)", () => {
    const pieces = buildPieces([
      delivered("PX-2026-020", "2026-11-10", 50),
      left("PTH-2026-021", "2026-11-10", 50),
    ]);
    expect(pieces[0]?.end?.minimumApplies).toBe(false);
  });

  it("does not apply the minimum to a same-customer transfer out (0.2 #70)", () => {
    const pieces = buildPieces([
      delivered("PX-1", "2026-11-01", 100),
      left("CCT-1", "2026-11-11", 100, "TRANSFER", { sameCustomer: true }),
    ]);
    expect(pieces[0]?.end?.minimumApplies).toBe(false);
    const other = buildPieces([
      delivered("PX-1", "2026-11-01", 100),
      left("CCT-1", "2026-11-11", 100, "TRANSFER", { sameCustomer: false }),
    ]);
    expect(other[0]?.end?.minimumApplies).toBe(true);
  });

  it("refuses more out than in", () => {
    expect(() =>
      buildPieces([
        delivered("PX-1", "2026-11-01", 10),
        left("PTH-9", "2026-11-02", 11),
      ]),
    ).toThrow("PTH-9");
  });
});

describe("transfers keep the first delivery date (0.2 #70)", () => {
  it("passes origins of a same-customer transfer to the target", () => {
    const source = buildPieces([
      delivered("PX-1", "2026-11-01", 60),
      delivered("PX-2", "2026-11-05", 60),
      left("CCT-1", "2026-11-11", 100, "TRANSFER", { sameCustomer: true }),
    ]);
    const origins = transferOrigins(source, "CCT-1", "H1,7");
    expect(origins).toEqual([
      { milli: 60_000, originDate: "2026-11-01" },
      { milli: 40_000, originDate: "2026-11-05" },
    ]);
    const target = buildPieces([
      {
        itemId: "H1,7",
        direction: "IN",
        milli: 100_000,
        date: d("2026-11-11"),
        order: ++order,
        doc: { type: "SITE_TRANSFER", id: "CCT-1", code: "CCT-1" },
        sameCustomer: true,
        origins,
      },
      left("PTH-5", "2026-11-26", 70),
    ]);
    expect(
      target.map((piece) => [
        piece.startDate,
        piece.originDate,
        piece.milli / 1000,
        piece.end?.date ?? null,
      ]),
    ).toEqual([
      ["2026-11-11", "2026-11-01", 60, "2026-11-26"],
      ["2026-11-11", "2026-11-05", 10, "2026-11-26"],
      ["2026-11-11", "2026-11-05", 30, null],
    ]);
  });

  it("starts a new chain for another customer", () => {
    const target = buildPieces([
      {
        itemId: "H1,7",
        direction: "IN",
        milli: 100_000,
        date: d("2026-11-11"),
        order: ++order,
        doc: { type: "SITE_TRANSFER", id: "CCT-2", code: "CCT-2" },
        sameCustomer: false,
        origins: [{ milli: 100_000, originDate: d("2026-11-01") }],
      },
    ]);
    expect(target[0]?.originDate).toBe("2026-11-11");
  });
});
