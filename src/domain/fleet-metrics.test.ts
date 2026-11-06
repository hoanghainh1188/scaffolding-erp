// Rental stock, losses and utilization (management-reports tasks 2.5; spec
// fleet-metrics; 0.2 #108, #109, #114).
import { describe, expect, it } from "vitest";

import type { BusinessDate } from "./business-date";
import { tonsText } from "./dashboard";
import {
  averageKgMilli,
  averagePieces,
  dailyFleet,
  fleetTotals,
  groupOthers,
  hundredthsText,
  lossPer100,
  lossTable,
  otherLosses,
  otherUses,
  REPORT_ROW_LIMIT,
  sumFleet,
  useTable,
  utilizationTenths,
  type FleetBalance,
  type FleetDelta,
  type FleetItem,
  type LossRow,
  type LossSum,
} from "./fleet-metrics";

const d = (value: string) => value as BusinessDate;
const K = 1000;
const KU: FleetItem = {
  itemId: "ku",
  code: "PK-KU",
  name: "Kích tăng U",
  unit: "PIECE",
  standardWeightKg: "5.000",
};
const TUBE: FleetItem = {
  itemId: "tube",
  code: "ONG-TH",
  name: "Ống thép",
  unit: "METER",
  standardWeightKg: "3.000",
};
const SEPTEMBER = ["2026-09"];
const balance = (itemId: string, onSite: boolean, pieces: number) =>
  ({ itemId, onSite, milli: pieces * K }) satisfies FleetBalance;
const delta = (
  date: string,
  itemId: string,
  onSite: boolean,
  pieces: number,
): FleetDelta => ({ date: d(date), ...balance(itemId, onSite, pieces) });

function september(opening: FleetBalance[], deltas: FleetDelta[]) {
  return sumFleet(
    dailyFleet(opening, deltas, d("2026-09-01"), d("2026-09-30")),
    SEPTEMBER,
  );
}

describe("rental stock by day (spec: hàng nhập giữa kỳ)", () => {
  const fleet = september(
    [balance("ku", false, 8_000)],
    [delta("2026-09-16", "ku", false, 4_000)],
  );

  it("averages the end-of-day stock", () => {
    expect(fleet.days).toBe(30);
    const sums = fleet.byItem.get("ku");
    expect(averagePieces(sums?.totalMilliDays ?? 0, fleet.days)).toBe(10_000);
    const [row] = lossTable([KU], fleet, [], SEPTEMBER).rows;
    expect(row && tonsText(averageKgMilli(row))).toBe("50,0");
  });

  it("reads a day's change at the end of that day", () => {
    const months = dailyFleet(
      [balance("ku", false, 10)],
      [delta("2026-09-02", "ku", false, -10)],
      d("2026-09-01"),
      d("2026-09-02"),
    );
    expect(months[0]?.byItem.get("ku")?.totalMilliDays).toBe(10 * K);
  });

  it("leaves out changes outside the range", () => {
    const months = dailyFleet(
      [balance("ku", false, 10)],
      [
        delta("2026-08-31", "ku", false, 99),
        delta("2026-10-01", "ku", false, 99),
      ],
      d("2026-09-01"),
      d("2026-09-30"),
    );
    expect(months[0]?.byItem.get("ku")?.totalMilliDays).toBe(10 * K * 30);
  });

  it("counts a running period up to today", () => {
    const months = dailyFleet(
      [balance("ku", false, 10)],
      [],
      d("2026-11-01"),
      d("2026-11-06"),
    );
    expect(months).toHaveLength(1);
    expect(months[0]?.days).toBe(6);
  });

  it("splits the days between months", () => {
    const months = dailyFleet(
      [balance("ku", false, 1)],
      [],
      d("2026-09-29"),
      d("2026-10-02"),
    );
    expect(months.map((month) => [month.month, month.days])).toEqual([
      ["2026-09", 2],
      ["2026-10", 2],
    ]);
    expect(sumFleet(months, ["2026-10"]).days).toBe(2);
  });
});

describe("losses per 100 tonnes (spec: hao hụt)", () => {
  const fleet = september(
    [balance("ku", false, 8_000)],
    [delta("2026-09-16", "ku", false, 4_000)],
  );
  const losses: LossSum[] = [
    { month: "2026-09", itemId: "ku", kind: "loss", milli: 10 * K },
    { month: "2026-09", itemId: "ku", kind: "scrap", milli: 4 * K },
    { month: "2026-09", itemId: "ku", kind: "repair", milli: 16 * K },
    { month: "2026-08", itemId: "ku", kind: "loss", milli: 500 * K },
  ];

  it("divides lost, scrap and repair tonnes by the average", () => {
    const { rows, total } = lossTable([KU], fleet, losses, SEPTEMBER);
    expect(rows[0]).toMatchObject({
      lossKgMilli: 50 * K,
      scrapKgMilli: 20 * K,
      repairKgMilli: 80 * K,
    });
    expect(hundredthsText(lossPer100(total))).toBe("0,30");
  });

  it("writes the year to date", () => {
    const year: LossRow = {
      itemId: null,
      code: "",
      name: "Cộng",
      kgDays: 412_700 * K * 304,
      days: 304,
      lossKgMilli: 40_200 * K,
      scrapKgMilli: 0,
      repairKgMilli: 0,
      count: 1,
    };
    expect(hundredthsText(lossPer100(year))).toBe("9,74");
  });

  it("has no ratio without rental stock", () => {
    const empty = september([], []);
    const { rows, total } = lossTable([KU], empty, [], SEPTEMBER);
    expect(rows).toEqual([]);
    expect(hundredthsText(lossPer100(total))).toBe("—");
  });

  it("keeps an item with a loss but no stock left", () => {
    const empty = september([], []);
    const { rows } = lossTable([KU], empty, losses, SEPTEMBER);
    expect(rows).toHaveLength(1);
    expect(lossPer100(rows[0] as LossRow)).toBeNull();
  });

  it("folds the items after the tenth into one row", () => {
    const items = Array.from({ length: 16 }, (_, index) => ({
      ...KU,
      itemId: `i${index}`,
      code: `M-${String(index).padStart(2, "0")}`,
    }));
    const fleet16 = september(
      items.map((item, index) => balance(item.itemId, false, 100 + index)),
      [],
    );
    const { rows } = lossTable(items, fleet16, [], SEPTEMBER);
    const { shown, others } = groupOthers(rows, REPORT_ROW_LIMIT, otherLosses);
    expect(shown).toHaveLength(10);
    expect(shown[0]?.code).toBe("M-15");
    expect(others?.name).toBe("6 mã khác");
    expect(others?.count).toBe(6);
  });
});

describe("utilization (spec: tỷ lệ khai thác)", () => {
  const opening = [
    balance("ku", false, 4_000),
    balance("ku", true, 6_000),
    balance("tube", false, 1_000),
    balance("tube", true, 1_000),
  ];
  const deltas = [
    delta("2026-09-11", "ku", true, 2_000),
    delta("2026-09-11", "ku", false, -2_000),
  ];
  const fleet = september(opening, deltas);

  it("averages the stock at sites day by day", () => {
    const [row] = useTable([KU, TUBE], fleet);
    expect(row?.code).toBe("PK-KU");
    expect(
      utilizationTenths(row?.siteMilliDays ?? 0, row?.totalMilliDays ?? 0),
    ).toBe(733);
    expect(averagePieces(row?.totalMilliDays ?? 0, fleet.days)).toBe(10_000);
    expect(averagePieces(row?.siteMilliDays ?? 0, fleet.days)).toBe(7_333);
  });

  it("adds every item in tonnes, lists pieces only by item", () => {
    const totals = fleetTotals([KU, TUBE], fleet);
    expect(utilizationTenths(totals.siteKgDays, totals.totalKgDays)).toBe(708);
    expect(useTable([KU, TUBE], fleet).map((row) => row.code)).toEqual([
      "PK-KU",
    ]);
  });

  it("has no rate without stock", () => {
    expect(utilizationTenths(0, 0)).toBeNull();
  });

  it("sorts highest first and folds the rest", () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      ...KU,
      itemId: `i${index}`,
      code: `M-${index}`,
    }));
    const fleet12 = september(
      items.flatMap((item, index) => [
        balance(item.itemId, true, index),
        balance(item.itemId, false, 20 - index),
      ]),
      [],
    );
    const rows = useTable(items, fleet12);
    expect(rows[0]?.code).toBe("M-11");
    const { others } = groupOthers(rows, REPORT_ROW_LIMIT, otherUses);
    expect(others?.name).toBe("2 mã khác");
    expect(others?.totalMilliDays).toBe(40 * K * 30);
  });

  it("counts items without a standard weight", () => {
    const loose: FleetItem = {
      ...TUBE,
      itemId: "loose",
      standardWeightKg: null,
    };
    const withLoose = september([balance("loose", false, 300)], []);
    expect(fleetTotals([loose], withLoose)).toMatchObject({
      totalKgDays: 0,
      weightless: 1,
    });
  });
});
