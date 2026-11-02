import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { StockLookup } from "@/lib/receiving/queries";

import { ItemStockCard } from "./item-stock-card";

const lookup = (overrides: Partial<StockLookup>): StockLookup => ({
  code: "GG-K17",
  name: "Khung giàn giáo 1,7m",
  unit: "PIECE",
  standardWeightKg: "13.500",
  yard: { NEW: 0, GOOD: 1_240_000, NEEDS_REPAIR: 186_000, SCRAP: 0 },
  workshop: 0,
  sites: 0,
  ...overrides,
});

describe("ItemStockCard", () => {
  it("names the unit and the kg per metre of a metre item", () => {
    render(
      <ItemStockCard
        item={lookup({
          code: "ONG-49",
          name: "Ống thép D49",
          unit: "METER",
          standardWeightKg: "3.560",
          yard: { NEW: 0, GOOD: 120_500, NEEDS_REPAIR: 0, SCRAP: 0 },
        })}
        scannedAt="09:41"
        canViewCard={false}
      />,
    );
    expect(screen.getByText("ONG-49 · m · 3,56 kg/m")).toBeInTheDocument();
    expect(screen.getByText("120,5")).toBeInTheDocument();
  });

  it("keeps the kg per piece of a piece item", () => {
    render(
      <ItemStockCard item={lookup({})} scannedAt="09:41" canViewCard={false} />,
    );
    expect(screen.getByText("GG-K17 · cái · 13,5 kg/cái")).toBeInTheDocument();
  });

  it("uses the bundle label for a bundle item", () => {
    render(
      <ItemStockCard
        item={lookup({
          code: "TC-BO",
          unit: "BUNDLE",
          standardWeightKg: "25.000",
        })}
        scannedAt="09:41"
        canViewCard={false}
      />,
    );
    expect(screen.getByText("TC-BO · bó · 25 kg/bó")).toBeInTheDocument();
  });

  it("shows no weight for a kg item", () => {
    render(
      <ItemStockCard
        item={lookup({
          code: "PL-SAT",
          unit: "KG",
          standardWeightKg: null,
        })}
        scannedAt="09:41"
        canViewCard={false}
      />,
    );
    expect(screen.getByText("PL-SAT · kg")).toBeInTheDocument();
  });
});
