import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("component project", () => {
  it("renders React into jsdom", () => {
    render(<p>Xin chào</p>);
    expect(screen.getByText("Xin chào")).toBeInTheDocument();
  });
});
