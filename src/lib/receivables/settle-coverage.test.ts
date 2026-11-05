// Every command that creates a debt settles it from the prepayment in its
// own transaction (receivables design D3). A new debt path that forgets
// settleCredits breaks "a customer with prepayment owes nothing".
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const LIB = join(process.cwd(), "src/lib");

/** file → the exported command that makes the debt. */
const DEBT_MAKERS: Readonly<Record<string, string>> = {
  "billing/close.ts": "closeBillingPeriod",
  "compensations/service.ts": "approveCompensation",
  "buy-backs/service.ts": "approveBuyBack",
  "deliveries/post.ts": "postDelivery",
  "receivables/receipts.ts": "cancelReceipt",
};

describe("debt paths settle the prepayment", () => {
  it.each(Object.entries(DEBT_MAKERS))("%s calls settleCredits", (file) => {
    const source = readFileSync(join(LIB, file), "utf8");
    expect(source).toMatch(/from "(@\/lib\/receivables\/credits|\.\/credits)"/);
    expect(source).toMatch(/await settleCredits\(/);
  });
});
