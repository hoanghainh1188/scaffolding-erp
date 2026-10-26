import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  quantityFromNumber,
  type Quantity,
  type QuantityUnit,
} from "@/domain/quantity";

import { Stepper } from "./stepper";

function Harness({
  initial,
  unit = "PIECE",
  max,
  onChange,
}: {
  initial: number;
  unit?: QuantityUnit;
  max?: number;
  onChange?: (q: Quantity) => void;
}) {
  const [value, setValue] = useState(quantityFromNumber(initial, unit));
  return (
    <Stepper
      label="Khung 1.7m"
      value={value}
      max={max}
      onValueChange={(q) => {
        setValue(q);
        onChange?.(q);
      }}
    />
  );
}

const input = () => screen.getByRole("textbox", { name: "Khung 1.7m" });

describe("Stepper", () => {
  it("adds one step with +", async () => {
    render(<Harness initial={12} />);
    await userEvent.click(screen.getByRole("button", { name: "Tăng" }));
    expect(input()).toHaveValue("13");
  });

  it("subtracts one step with −", async () => {
    render(<Harness initial={12} />);
    await userEvent.click(screen.getByRole("button", { name: "Giảm" }));
    expect(input()).toHaveValue("11");
  });

  it("cannot go below 0", () => {
    render(<Harness initial={0} />);
    expect(screen.getByRole("button", { name: "Giảm" })).toBeDisabled();
    expect(input()).toHaveValue("0");
  });

  it("disables + at the maximum", () => {
    render(<Harness initial={100} max={100} />);
    expect(screen.getByRole("button", { name: "Tăng" })).toBeDisabled();
  });

  it("clamps a typed value above the maximum", async () => {
    render(<Harness initial={20} max={100} />);
    await userEvent.clear(input());
    await userEvent.type(input(), "150");
    await userEvent.tab();
    expect(input()).toHaveValue("100");
  });

  it("restores the last valid value after typing text", async () => {
    render(<Harness initial={12} />);
    await userEvent.clear(input());
    await userEvent.type(input(), "abc");
    await userEvent.tab();
    expect(input()).toHaveValue("12");
  });

  it("rejects a fraction for pieces and says why", async () => {
    const onChange = vi.fn();
    render(<Harness initial={12} onChange={onChange} />);
    await userEvent.clear(input());
    await userEvent.type(input(), "12,5");
    await userEvent.tab();
    expect(input()).toHaveValue("12");
    expect(
      screen.getByText("Số lượng cái phải là số nguyên"),
    ).toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts a fraction for kilograms", async () => {
    render(<Harness initial={0} unit="KG" />);
    await userEvent.clear(input());
    await userEvent.type(input(), "250,5");
    await userEvent.tab();
    expect(input()).toHaveValue("250,5");
    expect(input()).toHaveAttribute("inputmode", "decimal");
  });

  it("shows the edit form while focused and the display form after", async () => {
    render(<Harness initial={1500} />);
    expect(input()).toHaveValue("1.500");
    await userEvent.click(input());
    expect(input()).toHaveValue("1500");
    await userEvent.tab();
    expect(input()).toHaveValue("1.500");
  });

  it("uses a numeric keyboard for pieces and 48px buttons", () => {
    render(<Harness initial={1} />);
    expect(input()).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByRole("button", { name: "Tăng" })).toHaveClass("size-12");
  });

  it("clears the message after a valid entry", async () => {
    render(<Harness initial={12} />);
    await userEvent.clear(input());
    await userEvent.type(input(), "1,5");
    await userEvent.tab();
    await userEvent.clear(input());
    await userEvent.type(input(), "14");
    await userEvent.tab();
    expect(
      screen.queryByText("Số lượng cái phải là số nguyên"),
    ).not.toBeInTheDocument();
    expect(input()).toHaveValue("14");
  });
});
