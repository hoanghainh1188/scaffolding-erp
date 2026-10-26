import { describe, expect, it } from "vitest";

import { findColorViolations } from "./check-colors.mts";

const matches = (source: string, file = "src/x.tsx") =>
  findColorViolations(file, source).map((v) => v.match);

describe("findColorViolations", () => {
  it.each([
    'className="bg-blue-600"',
    'className="text-white"',
    'className="hover:bg-slate-50/80"',
    'className="border-x-zinc-200"',
    'className="ring-offset-black"',
    "color: #1D5BFF;",
    'style={{ color: "#fff" }}',
  ])("flags %s", (source) => {
    expect(matches(source)).toHaveLength(1);
  });

  it.each([
    'className="bg-primary text-primary-foreground"',
    'className="text-muted-foreground border-border"',
    'className="bg-highlight text-highlight-foreground"',
    'className="text-success border-warning"',
    'className="bg-foreground/10"',
    "const id = `#${slug}`;",
    'href="#section-1"',
    "&#123;",
  ])("allows %s", (source) => {
    expect(matches(source)).toEqual([]);
  });

  it("reports the line number", () => {
    expect(findColorViolations("src/a.tsx", "ok\nbg-red-500")).toEqual([
      { file: "src/a.tsx", line: 2, match: "bg-red-500" },
    ]);
  });

  it("allows hex values only in the generated tokens file", () => {
    expect(matches("--primary: #1D5BFF;", "src/styles/tokens.css")).toEqual([]);
  });
});
