// Holds the short list of paths that may see personal numbers
// (personal-data-protection D9, spec "Không còn chỗ đọc số đầy đủ").
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return walk(path);
      return /\.m?tsx?$/.test(entry.name) ? [path] : [];
    },
  );
}

const IS_TEST = /\.test\.tsx?$/;
const SOURCES = [...walk("src"), ...walk("scripts")].filter(
  (path) => !IS_TEST.test(path) && !path.startsWith("src/test/"),
);
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Files whose text matches, minus the allowed ones. */
function offenders(pattern: RegExp, allowed: readonly string[]): string[] {
  return SOURCES.filter(
    (path) => !allowed.includes(path) && pattern.test(read(path)),
  ).map((path) => relative(ROOT, join(ROOT, path)));
}

describe("old columns of supplier", () => {
  it("are read only by the backfill", () => {
    expect(
      offenders(/\b(id_number|bank_account)\b(?!_)/, [
        "src/lib/privacy/backfill.ts",
        // AAD of the ciphertext, not the column.
        "src/lib/privacy/cipher.ts",
        // A field-name pattern for scrubbing error reports.
        "src/lib/monitoring/sanitize.ts",
        // The company's own account, printed on contracts.
        "src/db/schema/company.ts",
      ]),
    ).toEqual([]);
  });

  it("are not in the schema or read through drizzle", () => {
    expect(offenders(/\bsupplier\.(idNumber|bankAccount)\b/, [])).toEqual([]);
  });
});

describe("decryption", () => {
  it("of a CCCD happens only on the listed paths", () => {
    expect(
      offenders(/\bdecryptIdNumber\(/, [
        "src/lib/privacy/cipher.ts",
        "src/lib/catalog/partners.ts",
        "src/lib/privacy/anonymize.ts",
        "src/lib/privacy/rotate.ts",
      ]),
    ).toEqual([]);
  });

  it("of a tax file never happens on a screen or an API", () => {
    expect(
      offenders(/\bdecryptTaxIdentity\b/, [
        "src/lib/privacy/cipher.ts",
        "src/lib/privacy/rotate.ts",
        "src/lib/privacy/purge.ts",
      ]),
    ).toEqual([]);
  });
});

describe("sample data", () => {
  const SEEDS = SOURCES.filter(
    (path) =>
      /\/sample\.ts$|\/seed\.ts$/.test(path) ||
      /scripts\/seed-.*\.mts$/.test(path),
  );

  it("covers the seeds", () => {
    expect(SEEDS).toContain("src/lib/catalog/seed.ts");
    expect(SEEDS).toContain("scripts/seed-dev.mts");
  });

  it("has no 12-digit number that could be a real CCCD", () => {
    const real = SEEDS.filter((path) =>
      [...read(path).matchAll(/(?<![\d-])\d{12}(?![\d-])/g)].some(
        ([value]) => !value.startsWith("000"),
      ),
    );
    expect(real).toEqual([]);
  });
});

describe("search text", () => {
  it("never receives a CCCD or an account", () => {
    const calls = [
      "src/lib/catalog/partners.ts",
      "src/lib/privacy/anonymize.ts",
    ]
      .flatMap((path) => [...read(path).matchAll(/toSearchText\(([^)]*)\)/g)])
      .map(([, args]) => args ?? "");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((args) => /idNumber|bankAccount/.test(args))).toEqual(
      [],
    );
  });
});

describe("append-only tables", () => {
  it("get a seller's name only through sellerLabel", () => {
    const WRITES = /logActivity\(|postMovements\(|FieldSpec</;
    const NAME = /\bsupplier\.name\b/;
    expect(
      SOURCES.filter(
        (path) =>
          path.startsWith("src/lib/") &&
          !path.endsWith("/sample.ts") &&
          WRITES.test(read(path)) &&
          NAME.test(read(path)) &&
          !read(path).includes("sellerLabel"),
      ),
    ).toEqual([]);
  });
});
