import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { NumericKind } from "@/domain/numeric-text";

import { NumericInput } from "./numeric-input";
import { QuantityInput } from "./quantity-input";
import { toQuantity } from "@/domain/quantity";

function Controlled({ kind }: { kind: NumericKind }) {
  const [value, setValue] = useState("");
  return (
    <NumericInput
      aria-label="Số"
      kind={kind}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

describe("NumericInput", () => {
  it("ignores letters typed into a money field", async () => {
    render(<Controlled kind="money" />);
    const field = screen.getByRole("textbox", { name: "Số" });
    await userEvent.type(field, "1a2.5b00đ");
    expect(field).toHaveValue("12.500");
    expect(field).toHaveAttribute("inputmode", "numeric");
  });

  it("keeps the decimal mark for kg", async () => {
    render(<Controlled kind="decimal" />);
    const field = screen.getByRole("textbox", { name: "Số" });
    await userEvent.type(field, "12,5kg");
    expect(field).toHaveValue("12,5");
    expect(field).toHaveAttribute("inputmode", "decimal");
  });

  it("cleans pasted text in an uncontrolled field", async () => {
    render(<NumericInput aria-label="Số" kind="integer" name="days" />);
    const field = screen.getByRole("textbox", { name: "Số" });
    await userEvent.click(field);
    await userEvent.paste("30 ngày");
    expect(field).toHaveValue("30");
  });

  it("lets a refund amount start with a minus", async () => {
    render(<Controlled kind="signed-money" />);
    const field = screen.getByRole("textbox", { name: "Số" });
    await userEvent.type(field, "-50.000x");
    expect(field).toHaveValue("-50.000");
  });
});

describe("QuantityInput", () => {
  it("ignores letters while editing", async () => {
    render(
      <QuantityInput
        aria-label="Số lượng"
        value={toQuantity(0, "PIECE")}
        onValueChange={() => {}}
      />,
    );
    const field = screen.getByRole("textbox", { name: "Số lượng" });
    await userEvent.clear(field);
    await userEvent.type(field, "1x2");
    expect(field).toHaveValue("12");
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

describe("number fields", () => {
  // inputMode only changes the phone keyboard; a desktop still takes letters.
  it("use NumericInput instead of a bare inputMode", () => {
    const allowed = new Set([
      join("src", "components", "domain", "numeric-input.tsx"),
      join("src", "components", "domain", "quantity-input.tsx"),
    ]);
    const offenders = sourceFiles("src").filter(
      (file) =>
        !allowed.has(file) &&
        /inputMode=\{?["']?(numeric|decimal)|inputMode=\{\s*[^}]*(numeric|decimal)/.test(
          readFileSync(file, "utf8"),
        ),
    );
    expect(offenders).toEqual([]);
  });
});
