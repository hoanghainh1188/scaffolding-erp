import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DEMO_BANNER_TEXT, DemoBanner } from "./demo-banner";

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe("DemoBanner", () => {
  it("renders nothing when DEMO_MODE is not set", () => {
    delete process.env.DEMO_MODE;
    const { container } = render(<DemoBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when DEMO_MODE=false", () => {
    process.env.DEMO_MODE = "false";
    const { container } = render(<DemoBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders banner message when DEMO_MODE=true", () => {
    process.env.DEMO_MODE = "true";
    render(<DemoBanner />);
    const banner = screen.getByRole("status");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(DEMO_BANNER_TEXT);
  });
});
