// D1 Tổng quan (dashboard-basic tasks 6.1–6.3, design D1). Read only: the
// tests write nothing to the dev database. Numbers are compared with their
// source screens in the same run (D14 overdue, D10 "Tại công trình"),
// never with fixed values, since other specs change them.
import { expect, test, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
import { DESKTOP_READY, runOnlyIn, waitForHydration } from "./helpers";

const MONEY_BLOCKS = ["Công nợ quá hạn", "Doanh số", /^Top 5 nhà thầu năm/];

async function openDashboard(page: Page) {
  await page.goto("/dashboard");
  await waitForHydration(page, DESKTOP_READY);
}

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { name }).filter({ visible: true });

/** "15.504" of "15.504 cái" as a number. */
const number = (text: string) => Number(text.replace(/[^\d-]/g, ""));

test.describe("dashboard", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one flow is enough");
  });

  test.describe("as the director", () => {
    test("counts in the greeting the rows waiting for approval", async ({
      page,
    }) => {
      await openDashboard(page);
      const title = await page
        .getByRole("heading", { level: 1 })
        .filter({ visible: true })
        .innerText();
      const block = page.locator("section[aria-labelledby=approvals]");
      const rows = await block.getByRole("listitem").count();
      if (rows === 0) {
        expect(title).toMatch(/không có việc nào chờ bạn duyệt$/);
      } else {
        expect(title).toMatch(
          new RegExp(`hôm nay có ${rows} việc chờ bạn duyệt$`),
        );
      }
      for (const name of [...MONEY_BLOCKS, "Tra nhanh một công trình"]) {
        await expect(heading(page, name)).toBeVisible();
      }
      await expect(heading(page, /^Chờ bạn duyệt/)).toBeVisible();
    });

    test("shows the overdue amount of D14 and the pieces of D10", async ({
      page,
    }) => {
      await openDashboard(page);
      const overdue = await page
        .locator("section[aria-labelledby=kpi-overdue] p")
        .first()
        .innerText();
      const onSite = await page
        .getByText(/^[\d.]+ cái$/)
        .filter({ visible: true })
        .first()
        .innerText();

      const stock = (await (
        await page.request.get("/api/inventory/stock")
      ).json()) as {
        data: { rows: { unit: string; sites: number }[] };
      };
      const pieces = stock.data.rows
        .filter((row) => row.unit === "PIECE")
        .reduce((sum, row) => sum + row.sites, 0);
      expect(number(onSite)).toBe(pieces / 1000);

      await page.goto("/receivables?filter=overdue");
      await waitForHydration(page, DESKTOP_READY);
      const tile = page
        .locator("dt", { hasText: "Nợ quá hạn" })
        .filter({ visible: true })
        .locator("xpath=following-sibling::dd[1]");
      expect(await tile.innerText()).toBe(overdue);
    });

    test("finds the E2E rental site and refreshes without writing", async ({
      page,
    }) => {
      await openDashboard(page);
      await page.getByRole("combobox").fill("Dương Nội");
      await expect(
        page
          .getByText(/E2EXUAT$/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      await expect(
        page.getByText("Thuê tháng này").filter({ visible: true }).first(),
      ).toBeVisible();
      const refreshed = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/dashboard" &&
          response.request().method() === "GET",
      );
      await page.getByRole("button", { name: "Làm mới" }).click();
      expect((await refreshed).ok()).toBe(true);
      await expect(page.getByText(/số liệu lúc \d\d:\d\d$/)).toBeVisible();
    });
  });

  test.describe("as the accountant", () => {
    test.use({ storageState: statePath("ACCOUNTANT") });

    test("sees money and what waits for the director", async ({ page }) => {
      await openDashboard(page);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        /Giám đốc duyệt$/,
      );
      await expect(heading(page, /^Đang chờ Giám đốc duyệt/)).toBeVisible();
      for (const name of MONEY_BLOCKS) {
        await expect(heading(page, name)).toBeVisible();
      }
    });
  });

  test.describe("as sales", () => {
    test.use({ storageState: statePath("SALES") });

    test("gets no money from the server", async ({ page }) => {
      await openDashboard(page);
      await expect(heading(page, "Tra nhanh một công trình")).toBeVisible();
      for (const name of MONEY_BLOCKS) {
        await expect(heading(page, name)).toHaveCount(0);
      }
      const html = await page.content();
      expect(html).not.toContain("Công nợ quá hạn");
      expect(html).not.toContain("Doanh số tháng");
      expect(html).not.toContain("Top 5 nhà thầu");
    });

    test("looks up a site without money", async ({ page }) => {
      await openDashboard(page);
      const answered = page.waitForResponse((response) =>
        response.url().includes("/api/dashboard/site-lookup"),
      );
      await page.getByRole("combobox").fill("Dương Nội");
      const body = await (await answered).text();
      expect(body).not.toContain('"money"');
      await expect(
        page.getByText("Đang giữ").filter({ visible: true }).first(),
      ).toBeVisible();
      await expect(page.getByText("Thuê tháng này")).toHaveCount(0);
    });
  });

  test.describe("as the storekeeper", () => {
    test.use({ storageState: statePath("WAREHOUSE") });

    test("goes to the phone home", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/m$/);
    });
  });
});
