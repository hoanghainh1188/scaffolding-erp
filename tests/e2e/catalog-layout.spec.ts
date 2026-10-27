// D9 / D16 layout fixes from the code review of PR #28 (points 1-3).
import { expect, test } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

test.use({ storageState: statePath("SALES") });

test("D9 at 1366px shows both rent columns without scrolling", async ({
  page,
}, testInfo) => {
  test.skip(!runOnlyIn(testInfo, "desktop-1366"), "the 1366px screen");
  await page.goto("/catalog/items?item=GG-K17");
  await waitForHydration(page, DESKTOP_READY);

  const monthly = page.getByRole("columnheader", { name: /Giá thuê \/ tháng/ });
  await expect(monthly).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole("columnheader", { name: /Giá thuê \/ ngày/ }),
  ).toBeInViewport({
    ratio: 1,
  });
  const scroll = await page.getByRole("table").evaluate((table) => {
    const frame = table.parentElement as HTMLElement;
    return { content: frame.scrollWidth, shown: frame.clientWidth };
  });
  // Real slack, not an exact fit: font metrics differ by a pixel or two
  // between macOS and the Linux CI, so the narrowest the table can get
  // must stay well inside the frame.
  const narrowest = await page.getByRole("table").evaluate((table) => {
    table.style.width = "min-content";
    const width = table.scrollWidth;
    table.style.width = "";
    return width;
  });
  expect(narrowest).toBeLessThanOrEqual(scroll.shown - 24);
  expect(scroll.content).toBeLessThanOrEqual(scroll.shown);
  // The Thuộc bộ panel still shows, under the table.
  await expect(page.getByRole("region", { name: "Thuộc bộ" })).toContainText(
    "Bộ giàn giáo 1,7m",
  );
});

test.describe("desktop", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop screens");
  });

  test("D16 opens with the first customer's details", async ({ page }) => {
    await page.goto("/catalog/partners");
    const first = page
      .getByRole("navigation", { name: "Loại đối tác" })
      .locator("..")
      .getByRole("listitem")
      .first();
    const firstName =
      (await first.getByRole("link").locator("span").first().textContent()) ??
      "";
    const detail = page.getByRole("region", { name: "Chi tiết" });
    await expect(detail).not.toContainText("Chọn một dòng bên trái");
    await expect(detail.getByRole("heading", { level: 2 })).toHaveText(
      firstName,
    );
    await expect(first.getByRole("link")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("each D9 row has its own menu to edit, archive or delete", async ({
    page,
  }) => {
    await page.goto("/catalog/items");
    await waitForHydration(page, DESKTOP_READY);
    await page.getByRole("button", { name: "Thao tác với GG-K17" }).click();
    await expect(page.getByRole("menuitem")).toHaveText([
      "Sửa",
      "Ngừng dùng",
      "Xóa",
    ]);
    await page.getByRole("menuitem", { name: "Sửa" }).click();
    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("heading", { name: "Sửa GG-K17" }),
    ).toBeVisible();
    await expect(sheet.getByLabel("Tên vật tư")).toHaveValue(
      "Khung giàn giáo 1,7m",
    );
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("archiving from the row menu explains why GG-K17 stays", async ({
    page,
  }) => {
    await page.goto("/catalog/items");
    await waitForHydration(page, DESKTOP_READY);
    await page.getByRole("button", { name: "Thao tác với GG-K17" }).click();
    await page.getByRole("menuitem", { name: "Ngừng dùng" }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Ngừng dùng" }).click();
    await expect(confirm.getByRole("alert")).toHaveText(
      "Bỏ vật tư này khỏi bộ BO-17 hoặc ngừng dùng bộ trước",
    );
  });
});

test.describe("as Kế toán", () => {
  test.use({ storageState: statePath("ACCOUNTANT") });

  test("D9 rows have no menu", async ({ page }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop screens");
    await page.goto("/catalog/items");
    await expect(
      page.getByRole("button", { name: /Thao tác với/ }),
    ).toHaveCount(0);
  });
});
