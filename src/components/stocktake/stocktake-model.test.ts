import { describe, expect, it } from "vitest";

import { STOCKTAKE_MESSAGES } from "@/domain/stocktake";
import {
  alignDraft,
  emptyPayload,
  finishError,
  inputText,
  itemsOf,
  progressOf,
  toSubmitItems,
  uncountedLines,
  type CountViewData,
  type CountViewLine,
  type StocktakeDraftPayload,
} from "./stocktake-model";

const line = (overrides: Partial<CountViewLine>): CountViewLine => ({
  id: crypto.randomUUID(),
  itemId: "ch",
  itemCode: "GG-CH",
  itemName: "Chéo giàn giáo",
  unit: "PIECE",
  groupName: "Giàn giáo",
  condition: "GOOD",
  origin: "LISTED",
  counted: null,
  recount: false,
  ...overrides,
});

const view = (lines: CountViewLine[], round = 1): CountViewData => ({
  code: "KK-2026-003",
  status: "COUNTING",
  round,
  locationCode: "BAI-01",
  locationName: "Bãi chính",
  startedAt: "2026-10-28T01:00:00.000Z",
  scope: null,
  returnedReason: null,
  lines,
});

const FIRST = view([
  line({ condition: "GOOD" }),
  line({ condition: "NEEDS_REPAIR" }),
  line({ itemId: "k17", itemCode: "GG-K17", itemName: "Khung 1,7m" }),
]);

const counted = (
  values: StocktakeDraftPayload["counts"][string]["values"],
  countedAt: string | null = "2026-10-28T02:12:00.000Z",
) => ({ startedAt: "2026-10-28T02:00:00.000Z", countedAt, values });

describe("stocktake model", () => {
  it("needs a number for every condition before Xong mã này", () => {
    const [chItem] = itemsOf(FIRST, emptyPayload(1));
    if (!chItem) throw new Error("no item");
    expect(chItem.conditions).toEqual(["GOOD", "NEEDS_REPAIR"]);
    expect(finishError(chItem, counted({ GOOD: "2450" }, null), false)).toBe(
      STOCKTAKE_MESSAGES.missingCondition("NEEDS_REPAIR"),
    );
    expect(
      finishError(chItem, counted({ GOOD: "12,5", NEEDS_REPAIR: "0" }), false),
    ).toBe(STOCKTAKE_MESSAGES.wholePieces("GG-CH"));
    expect(
      finishError(chItem, counted({ GOOD: "2450", NEEDS_REPAIR: "0" }), false),
    ).toBeNull();
  });

  it("counts progress and builds the submission of finished items", () => {
    const payload: StocktakeDraftPayload = {
      ...emptyPayload(1),
      counts: {
        ch: counted({ GOOD: "2450", NEEDS_REPAIR: "50", SCRAP: "6" }),
        k17: counted({ GOOD: "1226" }, null),
      },
      extraConditions: { ch: ["SCRAP"] },
    };
    expect(progressOf(FIRST, payload)).toEqual({ counted: 3, total: 4 });
    expect(uncountedLines(FIRST, payload)).toBe(1);
    expect(toSubmitItems(FIRST, payload)).toEqual([
      {
        itemId: "ch",
        startedAt: "2026-10-28T02:00:00.000Z",
        countedAt: "2026-10-28T02:12:00.000Z",
        lines: [
          { condition: "GOOD", quantity: "2450.000" },
          { condition: "NEEDS_REPAIR", quantity: "50.000" },
          { condition: "SCRAP", quantity: "6.000" },
        ],
      },
    ]);
  });

  it("adds items not in the list", () => {
    const payload: StocktakeDraftPayload = {
      ...emptyPayload(1),
      added: [
        { itemId: "sat", itemCode: "PL-SAT", itemName: "Phế liệu", unit: "KG" },
      ],
      extraConditions: { sat: ["SCRAP"] },
      counts: { sat: counted({ SCRAP: "1248,25" }) },
    };
    const sat = itemsOf(FIRST, payload).at(-1);
    expect(sat).toMatchObject({
      itemCode: "PL-SAT",
      added: true,
      state: "DONE",
    });
    expect(toSubmitItems(FIRST, payload)[0]?.lines).toEqual([
      { condition: "SCRAP", quantity: "1248.250" },
    ]);
    expect(inputText("1248.250", "KG")).toBe("1248,25");
    expect(inputText("1226.000", "PIECE")).toBe("1226");
  });

  it("drops only the recounted lines of an older draft", () => {
    const old: StocktakeDraftPayload = {
      ...emptyPayload(1),
      counts: {
        ch: counted({ GOOD: "2450", NEEDS_REPAIR: "50" }),
        k17: counted({ GOOD: "1226" }),
      },
    };
    const second = view(
      [
        line({ condition: "GOOD", counted: "2450.000" }),
        line({ condition: "NEEDS_REPAIR", recount: true }),
        line({
          itemId: "k17",
          itemCode: "GG-K17",
          itemName: "Khung 1,7m",
          counted: "1226.000",
        }),
      ],
      2,
    );
    const aligned = alignDraft(old, second);
    expect(aligned.round).toBe(2);
    expect(aligned.counts.ch).toEqual(counted({ GOOD: "2450" }, null));
    expect(aligned.counts.k17).toEqual(old.counts.k17);
    expect(alignDraft(aligned, second)).toBe(aligned);
  });

  it("lets a recount round touch only the lines asked for", () => {
    const second = view(
      [
        line({ condition: "GOOD", counted: "2450.000" }),
        line({ condition: "NEEDS_REPAIR", recount: true }),
        line({
          itemId: "k17",
          itemCode: "GG-K17",
          itemName: "Khung 1,7m",
          counted: "1226.000",
        }),
      ],
      2,
    );
    const items = itemsOf(second, emptyPayload(2));
    expect(items.map((item) => item.state)).toEqual(["TODO", "LOCKED"]);
    const payload: StocktakeDraftPayload = {
      ...emptyPayload(2),
      counts: { ch: counted({ NEEDS_REPAIR: "42" }) },
    };
    const [chItem] = itemsOf(second, payload);
    if (!chItem) throw new Error("no item");
    expect(finishError(chItem, payload.counts.ch, true)).toBeNull();
    expect(toSubmitItems(second, payload)[0]?.lines).toEqual([
      { condition: "NEEDS_REPAIR", quantity: "42.000" },
    ]);
    expect(progressOf(second, payload)).toEqual({ counted: 3, total: 3 });
  });

  it("shows items the server already has as done after a return", () => {
    const returned = view(
      [
        line({ condition: "GOOD", counted: "2450.000" }),
        line({ condition: "NEEDS_REPAIR", counted: "50.000" }),
      ],
      2,
    );
    expect(itemsOf(returned, emptyPayload(2))[0]?.state).toBe("DONE");
    expect(toSubmitItems(returned, emptyPayload(2))).toEqual([]);
  });
});
