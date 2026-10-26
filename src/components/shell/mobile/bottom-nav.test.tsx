import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BottomNav } from "./bottom-nav";

const pathname = vi.hoisted(() => ({ current: "/m" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

describe("BottomNav", () => {
  it("has four tabs in order with their links", () => {
    render(<BottomNav />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Việc hôm nay", "/m"],
      ["Quét mã", "/m/scan"],
      ["Lịch sử", "/m/history"],
      ["Cá nhân", "/m/profile"],
    ]);
  });

  it("marks only the current tab", () => {
    pathname.current = "/m/history";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Lịch sử" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Việc hôm nay" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("keeps Việc hôm nay current on /m only, not on sub pages", () => {
    pathname.current = "/m";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Việc hôm nay" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("treats detail pages as part of their tab", () => {
    pathname.current = "/m/history/PN0001";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Lịch sử" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("gives every tab a tap target of at least 48px", () => {
    render(<BottomNav />);
    for (const link of screen.getAllByRole("link"))
      expect(link).toHaveClass("min-h-12");
  });

  it("is a labelled navigation landmark", () => {
    render(<BottomNav />);
    expect(
      screen.getByRole("navigation", { name: "Điều hướng chính" }),
    ).toBeInTheDocument();
  });
});
