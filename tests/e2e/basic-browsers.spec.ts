import { expect, test, type Page } from "@playwright/test";

import {
  DESKTOP_READY,
  MOBILE_READY,
  expectNoHorizontalScroll,
  runOnlyIn,
  waitForHydration,
} from "./helpers";

// Safari and Firefox have basic support: pages open, work and do not
// scroll sideways. Small visual differences are accepted.
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test.describe("basic support @basic", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      !runOnlyIn(testInfo, "firefox", "webkit"),
      "Firefox and WebKit only",
    );
  });

  test("the desktop area opens and its menu works", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/dashboard");
    await waitForHydration(page, DESKTOP_READY);
    await expectNoHorizontalScroll(page);
    await page.getByRole("link", { name: "Kho", exact: true }).click();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(
      page
        .getByRole("heading", { level: 1, name: "Kho" })
        .filter({ visible: true }),
    ).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("the mobile area opens and its tabs work", async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/m");
    await waitForHydration(page, MOBILE_READY);
    await expectNoHorizontalScroll(page);
    await page.getByRole("link", { name: "Lịch sử" }).click();
    await expect(page).toHaveURL(/\/m\/history$/);
    await expect(page.getByRole("link", { name: "Lịch sử" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(errors).toEqual([]);
  });
});
