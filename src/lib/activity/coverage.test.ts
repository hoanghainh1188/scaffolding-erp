// Every write a service exports reaches logActivity (activity-log design
// D5), so a new or changed service cannot ship without its log row. The
// check follows calls to functions of the same file (cancelOrder → endOrder).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const LIB = join(process.cwd(), "src/lib");

/** Exported names that start like a write. */
const WRITE_NAME =
  /^(create|update|delete|place|cancel|close|post|set|submit|approve|return|request|start|reset|unlock|lock|change|sign)[A-Z]/;

/** Files that never act for a signed-in user, so never log. */
const SKIPPED_FILE =
  /(\.test\.tsx?|\/sample\.ts|\/seed\.ts|\/e2e-accounts\.ts|\/first-director\.ts)$/;
const SKIPPED_DIRS = ["activity/", "drafts/"];

/**
 * Write-like names that are not an action of their own, with the reason.
 * Each entry must still exist (checked below), so the list cannot rot.
 */
export const NOT_LOGGED: Readonly<Record<string, string>> = {
  "auth/auth.ts#createAuth": "builds the Better Auth instance",
  "auth/actions.ts#signOutAction": "signing out is not logged (spec)",
  "inventory/post.ts#postMovements":
    "ledger helper; the document's own service logs the action",
  "inventory/adjustments.ts#lockAdjustment":
    "row lock shared with trip-adjustments.ts; the command logs",
  "inventory/post.ts#lockForPosting":
    "row locks before posting; writes nothing",
  "contracts/records.ts#lockContract":
    "row lock shared by the contract commands; the command logs",
  "contracts/records.ts#lockRevision":
    "row lock shared by the contract commands; the command logs",
  "deliveries/records.ts#lockNote":
    "row lock shared by the delivery commands; the command logs",
  "scan/detector.ts#createQrDetector": "camera QR reader in the browser",
  "stocktakes/queries.ts#startOptions": "reads the M6a choices",
  "returns/queries.ts#returnContracts": "reads the M4 contract list",
  "returns/queries.ts#returnContract": "reads one M4 contract",
  "returns/queries.ts#returnDetail": "reads a return note",
  "contracts/records.ts#lockContractsInOrder":
    "row locks of two contracts; the transfer command logs",
  "site-transfers/records.ts#lockTransfer":
    "row lock shared by the transfer commands; the command logs",
  "site-transfers/service.ts#lockPair":
    "row locks and reads before a transfer command; the command logs",
  "site-transfers/service.ts#lockTransferWithPair":
    "row locks before a transfer command; the command logs",
  "exchanges/records.ts#lockExchangeOfDelivery":
    "row lock of an exchange; the delivery command logs",
  "exchanges/records.ts#cancelExchangeOfDelivery":
    "part of cancelling the batch; changeDeliveryStatus logs",
  "exchanges/records.ts#lockJoinableExchange":
    "row lock inside postReturn; the return posting logs",
  "receivables/common.ts#lockCustomer":
    "row lock shared by the receivable commands; the command logs",
};

interface Found {
  key: string;
  logs: boolean;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => {
      const path = relative(LIB, file);
      return (
        !SKIPPED_FILE.test(file) &&
        !SKIPPED_DIRS.some((prefix) => path.startsWith(prefix))
      );
    });
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

/** Function bodies by name: declarations and `const x = (...) => ...`. */
function localFunctions(source: ts.SourceFile): Map<string, ts.Node> {
  const bodies = new Map<string, ts.Node>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      bodies.set(statement.name.text, statement);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (
          ts.isIdentifier(declaration.name) &&
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          bodies.set(declaration.name.text, init);
        }
      }
    }
  }
  return bodies;
}

function calledNames(node: ts.Node): string[] {
  const names: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
      names.push(child.expression.text);
    }
    // A local function passed as a value: run(() => helper(...)) or
    // .map(helper).
    if (ts.isIdentifier(child) && !ts.isCallExpression(child.parent)) {
      names.push(child.text);
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return names;
}

function reachesLog(
  start: string,
  bodies: Map<string, ts.Node>,
  seen = new Set<string>(),
): boolean {
  if (seen.has(start)) return false;
  seen.add(start);
  const body = bodies.get(start);
  if (!body) return false;
  const calls = calledNames(body);
  if (calls.includes("logActivity")) return true;
  return calls.some(
    (name) => bodies.has(name) && reachesLog(name, bodies, seen),
  );
}

function scan(): Found[] {
  return sourceFiles(LIB).flatMap((file) => {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const bodies = localFunctions(source);
    const path = relative(LIB, file);
    return source.statements
      .filter(isExported)
      .flatMap((statement) => {
        if (ts.isFunctionDeclaration(statement) && statement.name) {
          return [statement.name.text];
        }
        if (ts.isVariableStatement(statement)) {
          return statement.declarationList.declarations
            .filter((d) => ts.isIdentifier(d.name) && bodies.has(d.name.text))
            .map((d) => (d.name as ts.Identifier).text);
        }
        return [];
      })
      .filter((name) => WRITE_NAME.test(name))
      .map((name) => ({
        key: `${path}#${name}`,
        logs: reachesLog(name, bodies),
      }));
  });
}

describe("services log their writes", () => {
  const found = scan();

  it("finds the write functions it checks", () => {
    expect(found.length).toBeGreaterThanOrEqual(50);
  });

  it.each(
    found
      .filter((entry) => !(entry.key in NOT_LOGGED))
      .map((entry) => [entry.key, entry.logs] as const),
  )("%s calls logActivity", (_key, logs) => {
    expect(logs).toBe(true);
  });

  it("lists only exceptions that still exist", () => {
    const keys = new Set(found.map((entry) => entry.key));
    expect(Object.keys(NOT_LOGGED).filter((key) => !keys.has(key))).toEqual([]);
  });
});
