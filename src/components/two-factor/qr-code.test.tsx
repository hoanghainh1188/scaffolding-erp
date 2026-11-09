import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QrCode } from "./qr-code";

describe("QrCode", () => {
  it("draws an svg path with an accessible name", () => {
    const { container } = render(
      <QrCode value="otpauth://totp/a:b?secret=ABC" label="Mã QR" />,
    );
    expect(screen.getByRole("img", { name: "Mã QR" }).tagName).toBe("svg");
    expect(container.querySelector("path")?.getAttribute("d")).toMatch(/^M\d/);
    expect(container.innerHTML).not.toContain("otpauth");
  });
});
