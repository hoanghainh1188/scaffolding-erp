import { expect, test } from "@playwright/test";

import { MOBILE_READY, runOnlyIn, waitForHydration } from "./helpers";

test.describe("mobile shell", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "mobile-375"), "phone layout");
  });

  test("moves between the four tabs", async ({ page }) => {
    await page.goto("/m");
    await waitForHydration(page, MOBILE_READY);
    const tabs: [string, RegExp][] = [
      ["Quét mã", /\/m\/scan$/],
      ["Lịch sử", /\/m\/history$/],
      ["Cá nhân", /\/m\/profile$/],
      ["Việc hôm nay", /\/m$/],
    ];
    for (const [name, url] of tabs) {
      await page.getByRole("link", { name }).click();
      await expect(page).toHaveURL(url);
      await expect(
        page.getByRole("heading", { level: 1, name }).filter({ visible: true }),
      ).toHaveCount(1);
      await expect(page.getByRole("link", { name })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  });

  test("lets the director use the mobile area", async ({ page }) => {
    // Tests run signed in as Giám đốc unless they pick another role.
    await page.goto("/m/history");
    await expect(page).toHaveURL(/\/m\/history$/);
    await expect(
      page.getByRole("navigation", { name: "Điều hướng chính" }),
    ).toBeVisible();
  });

  test("goes back from a detail page", async ({ page }) => {
    await page.goto("/m/dev/detail");
    await expect(
      page.getByRole("heading", { level: 1, name: "Phiếu nhập" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Quay lại" }).click();
    await expect(page).toHaveURL(/\/m\/history$/);
  });

  test("shows the offline banner while the connection is down", async ({
    page,
    context,
  }) => {
    await page.goto("/m");
    await waitForHydration(page, MOBILE_READY);
    await context.setOffline(true);
    await expect(page.getByRole("status")).toHaveText("Mất kết nối");
    await context.setOffline(false);
    await expect(page.getByText("Mất kết nối")).toHaveCount(0);
  });

  test("serves the web app manifest", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      start_url: "/m",
      display: "standalone",
      theme_color: "#1D5BFF",
    });
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).ok()).toBe(true);
    }
  });
});
