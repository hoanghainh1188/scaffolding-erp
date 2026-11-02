import { expect, test } from "@playwright/test";

import {
  DESKTOP_READY,
  runOnlyIn,
  sidebarState,
  waitForHydration,
} from "./helpers";

test.describe("desktop shell", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      !runOnlyIn(testInfo, "desktop-1280", "desktop-1366"),
      "desktop layout",
    );
  });

  test("/ goes to the dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Tổng quan" }),
    ).toBeVisible();
  });

  test("highlights the current menu item", async ({ page }) => {
    await page.goto("/inventory");
    const current = page.locator("[data-slot=sidebar] [aria-current=page]");
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText("Kho");
    await expect(
      page.getByRole("link", { name: "Kho", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("shows all nine items to the director", async ({ page }) => {
    await page.goto("/dashboard");
    for (const label of [
      "Tổng quan",
      "Mua hàng",
      "Kho",
      "Sửa chữa",
      "Cho thuê & Bán",
      "Công nợ",
      "Báo cáo",
      "Danh mục",
      "Cài đặt",
    ]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    }
    await expect(page.locator("header")).toContainText("Giám đốc");
  });

  test("opens the Báo cáo placeholder from the menu", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Báo cáo", exact: true }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Báo cáo" }),
    ).toBeVisible();
    await expect(
      page.getByText("Đang xây dựng").filter({ visible: true }),
    ).toHaveCount(1);
  });
});

test.describe("desktop shell when printing", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      !runOnlyIn(testInfo, "desktop-1366"),
      "one print check is enough",
    );
  });

  test("prints only the content, without sidebar and header", async ({
    page,
  }) => {
    await page.goto("/inventory");
    await waitForHydration(page, DESKTOP_READY);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("[data-slot=sidebar]")).toBeHidden();
    await expect(page.locator("header")).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Tồn kho" }),
    ).toBeVisible();
  });
});

test.describe("desktop shell at other widths", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1366"), "sets its own viewport");
  });

  test("keeps the sidebar collapsed after a reload", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForHydration(page, DESKTOP_READY);
    expect(await sidebarState(page)).toBe("expanded");

    await page.getByRole("button", { name: "Thu gọn menu" }).click();
    expect(await sidebarState(page)).toBe("collapsed");

    await page.reload();
    await waitForHydration(page, DESKTOP_READY);
    expect(await sidebarState(page)).toBe("collapsed");
    await expect(page.locator("[data-slot=sidebar-container]")).toHaveCSS(
      "width",
      "48px",
    );
  });

  test("opens the menu as a drawer at 768px and closes it with Esc", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/dashboard");
    await waitForHydration(page, DESKTOP_READY);
    await expect(page.getByRole("link", { name: "Kho" })).toBeHidden();

    await page.getByRole("button", { name: "Mở menu" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Kho" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("replaces the search box with a button at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    const header = page.locator("header");
    await expect(
      header.getByRole("button", { name: "Tìm kiếm" }),
    ).toBeVisible();
    await expect(
      header.getByRole("searchbox", { name: "Tìm kiếm" }),
    ).toBeHidden();
    await expect(header.getByRole("button", { name: "Mở menu" })).toBeVisible();
  });
});
