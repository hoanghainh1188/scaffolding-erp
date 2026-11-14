// The only job that holds the production CCCD keys (review PR #176 item 3).
import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

const DIR = ".github/workflows";
const WORKFLOW = readFileSync(`${DIR}/pii-maintenance.yml`, "utf8");
const KEY_SECRET = "PROD_PII_ENCRYPTION_KEYS";

describe("pii-maintenance.yml", () => {
  it("runs in its own environment, not the one scheduled jobs use", () => {
    expect(WORKFLOW).toMatch(/^\s+environment: production-pii$/m);
    expect(WORKFLOW).not.toMatch(/^\s+environment: production$/m);
  });

  it("runs from main only", () => {
    expect(WORKFLOW).toContain("if: github.ref == 'refs/heads/main'");
  });

  it("pins every action by commit SHA", () => {
    const uses = [...WORKFLOW.matchAll(/^\s+- uses: (\S+)/gm)].map(
      ([, ref]) => ref ?? "",
    );
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.filter((ref) => !/@[0-9a-f]{40}$/.test(ref))).toEqual([]);
  });

  it("is triggered by hand only", () => {
    expect(WORKFLOW).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(WORKFLOW).not.toMatch(/^\s+(schedule|push|pull_request):/m);
  });
});

describe("other workflows", () => {
  it("never read the production CCCD keys", () => {
    const others = readdirSync(DIR).filter(
      (name) => /\.ya?ml$/.test(name) && name !== "pii-maintenance.yml",
    );
    expect(
      others.filter((name) =>
        readFileSync(`${DIR}/${name}`, "utf8").includes(KEY_SECRET),
      ),
    ).toEqual([]);
  });
});
