// Every command that creates what a seller is owed, and cancelling a
// payment, settles it from the advance in its own transaction (payables
// design D3). A new path that forgets settleAdvances breaks "a seller with
// an advance is owed nothing".
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const LIB = join(process.cwd(), "src/lib");

/** file → the exported command that makes or reopens the debt. */
const DEBT_MAKERS: Readonly<Record<string, string>> = {
  "receiving/post.ts": "postReceipt",
  "payables/payments.ts": "cancelPayment",
};

describe("payable paths settle the advance", () => {
  it.each(Object.entries(DEBT_MAKERS))(
    "%s (%s) calls settleAdvances",
    (file) => {
      const source = readFileSync(join(LIB, file), "utf8");
      expect(source).toMatch(
        /from "(@\/lib\/payables\/advances|\.\/advances)"/,
      );
      expect(source).toMatch(/await settleAdvances\(/);
    },
  );
});
