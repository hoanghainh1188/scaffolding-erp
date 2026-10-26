import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppBar } from "./app-bar";

describe("AppBar", () => {
  it("shows the page title as the heading", () => {
    render(<AppBar title="Việc hôm nay" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Việc hôm nay" }),
    ).toHaveClass("font-display");
    expect(
      screen.queryByRole("link", { name: "Quay lại" }),
    ).not.toBeInTheDocument();
  });

  it("adds a back button on detail pages", () => {
    render(<AppBar title="Phiếu nhập" backHref="/m/history" />);
    expect(
      screen.getByRole("heading", { name: "Phiếu nhập" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quay lại" })).toHaveAttribute(
      "href",
      "/m/history",
    );
  });
});
