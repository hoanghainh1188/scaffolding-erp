// inventory-ledger design D1: only test helpers may set the flag that lets
// TRUNCATE through the ledger trigger (which also requires a *_test DB).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOTS = ["src", "scripts", "tests"];
const ALLOWED = [join("src", "test") + "/"];
const FLAG = "inventory.allow_truncate";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("inventory.allow_truncate", () => {
  it("appears only in src/test/ (and the migration)", () => {
    const offenders = ROOTS.flatMap(files).filter(
      (path) =>
        !ALLOWED.some((prefix) => path.startsWith(prefix)) &&
        /\.(m?[jt]sx?)$/.test(path) &&
        readFileSync(path, "utf8").includes(FLAG),
    );
    expect(offenders).toEqual([]);
  });
});
