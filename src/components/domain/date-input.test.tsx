import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DateInput } from "./date-input";
import { Label } from "@/components/ui/label";

function Harness({
  initial = "",
  max,
  required,
  onChange,
}: {
  initial?: string;
  max?: string;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Label htmlFor="d" required={required}>
        Ngày tồn đầu
      </Label>
      <DateInput
        id="d"
        value={value}
        max={max}
        required={required}
        onValueChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    </>
  );
}

const input = () => screen.getByRole("textbox", { name: "Ngày tồn đầu" });

describe("DateInput", () => {
  it("shows the stored day as dd/mm/yyyy", () => {
    render(<Harness initial="2026-11-05" />);
    expect(input()).toHaveValue("05/11/2026");
  });

  it("reads typed text day first and sends YYYY-MM-DD", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(input(), "5/11/2026{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("2026-11-05");
    expect(input()).toHaveValue("05/11/2026");
  });

  it("explains a day that is not on the calendar and keeps the old value", async () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-04-01" onChange={onChange} />);
    await userEvent.clear(input());
    await userEvent.type(input(), "31/04/2026");
    await userEvent.tab();
    expect(screen.getByText("Không có ngày 31/04/2026")).toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(input()).toHaveValue("01/04/2026");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears to no date", async () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-04-01" onChange={onChange} />);
    await userEvent.clear(input());
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("refuses a day after max", async () => {
    render(<Harness max="2026-10-29" />);
    await userEvent.type(input(), "30/10/2026{Enter}");
    expect(
      screen.getByText("Ngày không được sau 29/10/2026"),
    ).toBeInTheDocument();
  });

  it("picks a day from the calendar", async () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-11-05" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Mở lịch" }));
    const grid = await screen.findByRole("grid");
    await userEvent.click(
      Array.from(grid.querySelectorAll("button")).find(
        (button) => button.textContent === "20",
      )!,
    );
    expect(onChange).toHaveBeenLastCalledWith("2026-11-20");
    expect(input()).toHaveValue("20/11/2026");
  });

  it("marks required Label and shows immediate error on blur when empty, clearing on change", async () => {
    render(<Harness required />);
    const label = screen.getByText("Ngày tồn đầu");
    expect(label).toHaveAttribute("data-required", "true");
    await userEvent.click(input());
    await userEvent.tab();
    expect(screen.getByText("Vui lòng nhập ngày")).toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(input(), "5");
    expect(screen.queryByText("Vui lòng nhập ngày")).not.toBeInTheDocument();
  });
});
