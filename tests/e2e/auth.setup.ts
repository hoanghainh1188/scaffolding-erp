// Signs in once per role through the real /login page and saves each
// browser state for the test projects (design D8).
import { expect, test as setup } from "@playwright/test";

import { E2E_ACCOUNTS } from "@/lib/users/e2e-accounts";

import { E2E_PASSWORD, signInThroughForm, statePath } from "./auth-helpers";

for (const account of E2E_ACCOUNTS) {
  setup(`sign in as ${account.role}`, async ({ page }) => {
    await signInThroughForm(page, account.username, E2E_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
    await page.context().storageState({ path: statePath(account.role) });
  });
}
