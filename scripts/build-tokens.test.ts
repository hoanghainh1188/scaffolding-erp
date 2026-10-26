import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  OUTPUT_PATH,
  buildTokensCss,
  readTokens,
  type DesignTokens,
} from "./build-tokens.mts";

const css = buildTokensCss(readTokens());

describe("tokens.css", () => {
  it("matches tokens.json (run `npm run tokens` after editing the JSON)", () => {
    expect(readFileSync(OUTPUT_PATH, "utf8")).toBe(css);
  });

  it("uses the light theme values with shadcn names", () => {
    expect(css).toContain("--primary: #1D5BFF;");
    expect(css).toContain("--background: #F7F9FF;");
    expect(css).toContain("--color-highlight: var(--highlight);");
  });

  it("resolves {primary} references", () => {
    expect(css).toContain("--ring: #1D5BFF;");
    expect(css).not.toMatch(/\{[a-z-]+\}/);
  });

  it("emits radius, type and shadow tokens for Tailwind", () => {
    expect(css).toContain("--radius: 12px;");
    expect(css).toContain("--radius-pill: 9999px;");
    expect(css).toContain("--text-h1: 28px;");
    expect(css).toContain("--text-h1--letter-spacing: -0.01em;");
    expect(css).toContain("--font-display: var(--next-font-display),");
    expect(css).toContain("--shadow-popover:");
  });

  it("rejects unknown and circular references", () => {
    const base = readTokens();
    const withColors = (
      tokens: DesignTokens["color"]["tokens"],
    ): DesignTokens => ({
      ...base,
      color: { tokens },
    });
    expect(() =>
      buildTokensCss(
        withColors([{ name: "ring", value: { light: "{nope}", dark: "" } }]),
      ),
    ).toThrow('Unknown colour token "nope"');
    expect(() =>
      buildTokensCss(
        withColors([
          { name: "a", value: { light: "{b}", dark: "" } },
          { name: "b", value: { light: "{a}", dark: "" } },
          { name: "radius-md", value: { light: "", dark: "" } },
        ]),
      ),
    ).toThrow("Circular colour reference");
  });
});
