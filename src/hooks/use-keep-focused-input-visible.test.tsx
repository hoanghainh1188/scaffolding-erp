import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useKeepFocusedInputVisible } from "./use-keep-focused-input-visible";

class FakeVisualViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
}

let viewport: FakeVisualViewport;

function Harness() {
  useKeepFocusedInputVisible();
  return (
    <>
      <input aria-label="Trên" />
      <input aria-label="Dưới" />
      <button type="button">Nút</button>
    </>
  );
}

function placeAt(element: HTMLElement, top: number) {
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + 44,
      left: 0,
      right: 300,
      height: 44,
      width: 300,
    }) as DOMRect;
}

beforeEach(() => {
  viewport = new FakeVisualViewport();
  vi.stubGlobal("visualViewport", viewport);
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function openKeyboard(height: number) {
  viewport.height = height;
  act(() => {
    viewport.dispatchEvent(new Event("resize"));
  });
}

describe("useKeepFocusedInputVisible", () => {
  it("scrolls the focused input into view when the keyboard covers it", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Dưới" });
    placeAt(input, 700);
    act(() => input.focus());
    openKeyboard(450);
    expect(input.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
  });

  it("leaves a visible input alone", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Trên" });
    placeAt(input, 100);
    act(() => input.focus());
    openKeyboard(450);
    expect(input.scrollIntoView).not.toHaveBeenCalled();
  });

  it("ignores focus on buttons", () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Nút" });
    placeAt(button, 700);
    act(() => button.focus());
    openKeyboard(450);
    expect(button.scrollIntoView).not.toHaveBeenCalled();
  });

  it("checks again when the input gains focus after the keyboard is open", () => {
    render(<Harness />);
    openKeyboard(450);
    const input = screen.getByRole("textbox", { name: "Dưới" });
    placeAt(input, 700);
    act(() => input.focus());
    expect(input.scrollIntoView).toHaveBeenCalledOnce();
  });

  it("does not animate when the user prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
    }));
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Dưới" });
    placeAt(input, 700);
    act(() => input.focus());
    openKeyboard(450);
    expect(input.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "auto",
    });
  });
});
