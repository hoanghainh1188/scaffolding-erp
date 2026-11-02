// No new "PIECE" / "KG" branches (catalog-extensions D2): code asks
// isCountUnit (whole numbers?) or hasStandardWeight (convert to kg?) from
// src/domain/quantity.ts, so a new unit never falls into the wrong branch.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

// The one place that defines the units, the kg conversion (whose inputs
// are kg by definition), and the DB schema and seeds that spell them out.
const ALLOWED = [
  "domain/quantity.ts",
  "domain/weight-conversion.ts",
  "db/schema/",
];

const COMPARISON =
  /[!=]==?\s*["'](PIECE|KG)["']|["'](PIECE|KG)["']\s*[!=]==?|\b(eq|ne)\([^,]*\bunit\b[^,]*,\s*["'](PIECE|KG)["']\)/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "test" ? [] : sources(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function unitBranches(files: readonly string[]): string[] {
  return files.flatMap((file) => {
    const name = relative(ROOT, file);
    if (ALLOWED.some((allowed) => name.startsWith(allowed))) return [];
    return readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, index) =>
        COMPARISON.test(line) ? [`${name}:${index + 1}: ${line.trim()}`] : [],
      );
  });
}

describe("unit branches", () => {
  it("never compares a unit with PIECE or KG outside quantity.ts", () => {
    expect(unitBranches(sources(ROOT))).toEqual([]);
  });

  it("catches such a comparison", () => {
    expect(COMPARISON.test('if (row.unit === "PIECE") {')).toBe(true);
    expect(COMPARISON.test('"KG" !== line.unit')).toBe(true);
    expect(COMPARISON.test('eq(item.unit, "PIECE")')).toBe(true);
    expect(COMPARISON.test('quantityFromDb(value, "KG")')).toBe(false);
  });
});
