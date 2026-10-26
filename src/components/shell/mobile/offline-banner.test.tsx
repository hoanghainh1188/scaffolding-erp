import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfflineBanner } from "./offline-banner";

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

afterEach(() => vi.restoreAllMocks());

describe("OfflineBanner", () => {
  it("stays hidden while online", () => {
    render(<OfflineBanner />);
    expect(screen.queryByText("Mất kết nối")).not.toBeInTheDocument();
  });

  it("appears when the connection drops and goes away when it returns", () => {
    render(<OfflineBanner />);
    setOnline(false);
    expect(screen.getByRole("status")).toHaveTextContent("Mất kết nối");
    setOnline(true);
    expect(screen.queryByText("Mất kết nối")).not.toBeInTheDocument();
  });

  it("shows right away when the page opens offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineBanner />);
    expect(screen.getByText("Mất kết nối")).toBeInTheDocument();
  });
});
