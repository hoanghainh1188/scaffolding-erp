import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { quantityFromNumber, type QuantityUnit } from "@/domain/quantity";

import { ConditionSplit, type SplitParts } from "./condition-split";

function Harness({
  total,
  parts,
  unit = "PIECE",
  withLost = false,
}: {
  total: number;
  parts: [number, number, number, number?];
  unit?: QuantityUnit;
  withLost?: boolean;
}) {
  const q = (n: number) => quantityFromNumber(n, unit);
  const [value, setValue] = useState<SplitParts>({
    GOOD: q(parts[0]),
    NEEDS_REPAIR: q(parts[1]),
    SCRAP: q(parts[2]),
    LOST: q(parts[3] ?? 0),
  });
  return (
    <ConditionSplit
      total={q(total)}
      value={value}
      onValueChange={setValue}
      withLost={withLost}
    />
  );
}

const status = () => screen.getByRole("status");

describe("ConditionSplit", () => {
  it("balances a return including lost items", () => {
    render(<Harness total={100} parts={[80, 15, 3, 2]} withLost />);
    expect(status()).toHaveTextContent("Đã khớp");
    expect(status()).toHaveAttribute("data-state", "balanced");
  });

  it("warns about items not yet classified", () => {
    render(<Harness total={100} parts={[80, 15, 0]} />);
    expect(status()).toHaveTextContent("Còn 5 chưa phân loại");
    expect(status()).toHaveAttribute("data-state", "under");
  });

  it("warns when the parts exceed the total", () => {
    render(<Harness total={100} parts={[90, 15, 0]} />);
    expect(status()).toHaveTextContent("Vượt 5 so với tổng");
    expect(status()).toHaveAttribute("data-state", "over");
  });

  it("is balanced when everything is zero", () => {
    render(<Harness total={0} parts={[0, 0, 0]} />);
    expect(status()).toHaveTextContent("Đã khớp");
  });

  it("balances kilograms with decimals", () => {
    render(<Harness total={250.5} parts={[200, 50, 0.5]} unit="KG" />);
    expect(status()).toHaveTextContent("Đã khớp");
  });

  it("updates as the user types", async () => {
    render(<Harness total={100} parts={[80, 15, 0]} />);
    const scrap = screen.getByRole("textbox", { name: "Phế liệu" });
    await userEvent.clear(scrap);
    await userEvent.type(scrap, "5");
    await userEvent.tab();
    expect(status()).toHaveTextContent("Đã khớp");
  });

  it("rejects a fraction of pieces and leaves it out of the sum", async () => {
    render(<Harness total={100} parts={[0, 15, 5]} />);
    const good = screen.getByRole("textbox", { name: "Tốt" });
    await userEvent.clear(good);
    await userEvent.type(good, "79,5");
    await userEvent.tab();
    expect(
      screen.getByText("Số lượng cái phải là số nguyên"),
    ).toBeInTheDocument();
    expect(status()).toHaveTextContent("Còn 80 chưa phân loại");
  });

  it("has three parts for purchase receipts", () => {
    render(<Harness total={10} parts={[10, 0, 0]} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
    expect(
      screen.queryByRole("textbox", { name: "Mất" }),
    ).not.toBeInTheDocument();
  });

  it("adds a Mất part for returns", () => {
    render(<Harness total={10} parts={[10, 0, 0]} withLost />);
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    expect(screen.getByRole("textbox", { name: "Mất" })).toBeInTheDocument();
  });
});
