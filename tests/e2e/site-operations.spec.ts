// Site transfers, buy-backs and exchanges (site-operations tasks 7.2):
// E2E-KHO-02 moves from the E2E rental (customer part "E2EXUAT") to the
// second E2E rental ("E2ECHUYEN"), from the office and from the phone; sales
// make a buy-back the director approves; an exchange batch goes out on M5's
// API and its return joins it on M4's API. Global setup keeps both rentals
// and their stock; the ledger cannot be emptied, so checks are differences.
import { randomUUID } from "node:crypto";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { statePath } from "./auth-helpers";
import {
  DESKTOP_READY,
  MOBILE_READY,
  runOnlyIn,
  waitForHydration,
} from "./helpers";

// E2E-KHO-02: deliveries.spec and returns.spec measure E2E-KHO-01 of the
// same rental at the same time.
const ITEM = "E2E-KHO-02";

async function contractId(page: Page, token: string): Promise<string> {
  const response = await page.request.get(`/api/contracts?q=${token}`);
  const body = (await response.json()) as {
    data: { rows: { id: string; code: string }[] };
  };
  const row = body.data.rows.find((entry) => entry.code.endsWith(token));
  if (!row) throw new Error(`no E2E contract ${token} (global setup)`);
  return row.id;
}

/** A D6 column of the item, read by its name (0 when the column is hidden). */
async function d6Column(page: Page, id: string, name: string) {
  await page.goto(`/sales/contracts/${id}/deliveries`);
  await waitForHydration(page, DESKTOP_READY);
  const table = page
    .getByRole("region", { name: "Hàng đang ở công trình" })
    .filter({ visible: true });
  const headers = (await table.getByRole("columnheader").allTextContents()).map(
    (text) => text.trim(),
  );
  const index = headers.indexOf(name);
  if (index < 0) return 0;
  const row = table.getByRole("row").filter({ hasText: ITEM });
  if ((await row.count()) === 0) return 0;
  const text = await row
    .getByRole("cell")
    .nth(index - 1)
    .textContent();
  return Number((text ?? "0").replace(/[^\d]/g, ""));
}

const onSite = (page: Page, id: string) =>
  d6Column(page, id, "Đang ở công trình");

async function newContext(browser: Browser, role: "SALES" | "WAREHOUSE") {
  const context = await browser.newContext({
    storageState: statePath(role),
    ...(role === "WAREHOUSE" ? { viewport: { width: 390, height: 844 } } : {}),
  });
  return context.newPage();
}

async function fillTransfer(page: Page, from: string, count: string) {
  await page.goto(`/sales/contracts/${from}/site-transfer/new`);
  await waitForHydration(page, DESKTOP_READY);
  const select = page
    .getByLabel("Công trình nhận", { exact: true })
    .filter({ visible: true });
  const value = await select
    .locator("option", { hasText: "E2ECHUYEN" })
    .getAttribute("value");
  await select.selectOption(value ?? "");
  await page
    .getByRole("textbox", { name: `Số chuyển ${ITEM}` })
    .filter({ visible: true })
    .fill(count);
}

test.describe("site operations", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({}, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one flow is enough");
  });

  test("the office moves goods to another site; D6 of both follows", async ({
    page,
  }) => {
    const from = await contractId(page, "E2EXUAT");
    const to = await contractId(page, "E2ECHUYEN");
    const fromBefore = await onSite(page, from);
    const toBefore = await onSite(page, to);

    await fillTransfer(page, from, "1");
    await expect(
      page.getByText("Tiền thuê 1 ngày ở", { exact: false }).filter({
        visible: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Xác nhận chuyển" })
      .filter({ visible: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /^Phiếu chuyển CCT-/ }),
    ).toBeVisible();
    await expect(
      page.getByText("Trạng thái: Đã chuyển").filter({ visible: true }),
    ).toBeVisible();

    expect(await onSite(page, from)).toBe(fromBefore - 1);
    expect(await onSite(page, to)).toBe(toBefore + 1);
    expect(await d6Column(page, to, "Chuyển đến")).toBeGreaterThan(0);
  });

  test("the phone confirms carrying less than the office wrote", async ({
    page,
    browser,
  }) => {
    const from = await contractId(page, "E2EXUAT");
    const before = await onSite(page, from);
    await fillTransfer(page, from, "2");
    await page
      .getByText("Gửi điện thoại xác nhận", { exact: true })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("button", { name: "Gửi điện thoại" })
      .filter({ visible: true })
      .click();
    const heading = page.getByRole("heading", { name: /^Phiếu chuyển CCT-/ });
    await expect(heading).toBeVisible();
    const code = ((await heading.textContent()) ?? "").replace(
      "Phiếu chuyển ",
      "",
    );

    const phone = await newContext(browser, "WAREHOUSE");
    await phone.goto(`/m/site-transfers/${code}`);
    await waitForHydration(phone, MOBILE_READY);
    await phone
      .getByRole("article", { name: ITEM })
      .getByRole("button", { name: "Giảm" })
      .click();
    await expect(
      phone.getByText(/Chở ít hơn 1 cái/).filter({ visible: true }),
    ).toBeVisible();
    await phone
      .getByRole("button", { name: /^Xác nhận đã chuyển tới/ })
      .click();
    await phone.waitForURL(/\/m$/);
    await phone.context().close();

    expect(await onSite(page, from)).toBe(before - 1);
  });

  test("sales make a buy-back, the director approves it", async ({
    page,
    browser,
  }) => {
    const from = await contractId(page, "E2EXUAT");
    const before = await onSite(page, from);

    const sales = await newContext(browser, "SALES");
    await sales.goto(`/sales/contracts/${from}/buy-back/new`);
    await waitForHydration(sales, DESKTOP_READY);
    await sales
      .getByRole("textbox", { name: `Số mua ${ITEM}` })
      .filter({ visible: true })
      .fill("1");
    await sales
      .getByLabel("Lý do")
      .filter({ visible: true })
      .fill("E2E thử: khách giữ lại");
    await sales
      .getByRole("button", { name: "Gửi Giám đốc duyệt" })
      .filter({ visible: true })
      .click();
    await sales.waitForURL(/\/sales\/buy-backs\/MLA-/);
    const url = sales.url();
    await sales.context().close();

    await page.goto(url);
    await waitForHydration(page, DESKTOP_READY);
    await page
      .getByRole("button", { name: /^Duyệt / })
      .filter({ visible: true })
      .click();
    await expect(
      page.getByText(/Tiền bán · Đã duyệt/).filter({ visible: true }),
    ).toBeVisible();

    expect(await onSite(page, from)).toBe(before - 1);
    expect(await d6Column(page, from, "Mua lại")).toBeGreaterThan(0);
  });

  test("an exchange batch goes out and its return joins it", async ({
    page,
    browser,
  }) => {
    const from = await contractId(page, "E2EXUAT");
    await page.goto(`/sales/contracts/${from}/exchange/new`);
    await waitForHydration(page, DESKTOP_READY);
    await page
      .getByRole("textbox", { name: `Số giao ${ITEM}` })
      .filter({ visible: true })
      .fill("1");
    await page
      .getByRole("textbox", { name: `Số nhận ${ITEM}` })
      .filter({ visible: true })
      .fill("1");
    await page
      .getByLabel("Giao nhiều hơn số còn phải giao thì vẫn giao")
      .filter({ visible: true })
      .check();
    await page
      .getByRole("button", { name: "Tạo đợt xuất + chờ thu hồi" })
      .filter({ visible: true })
      .click();
    await page.waitForURL(/\/deliveries$/);
    const waiting = page
      .getByText(`Chờ thu hồi 1 ${ITEM}`)
      .filter({ visible: true })
      .first();
    await expect(waiting).toBeVisible();
    const code =
      (await page
        .getByRole("listitem")
        .filter({ has: waiting })
        .getByRole("link", { name: /^PX-/ })
        .textContent()) ?? "";
    const deliveryCode = code.split(" ")[0] ?? "";

    // M5 and M4 through their APIs, as the storekeeper.
    const phone = await newContext(browser, "WAREHOUSE");
    await phone.goto("/m");
    // Writes need the same origin as the app (CSRF check of withAuth).
    const headers = { origin: new URL(phone.url()).origin };
    const api = phone.request;
    const start = await api.post(`/api/m/deliveries/${deliveryCode}/start`, {
      data: {},
      headers,
    });
    expect(start.ok()).toBe(true);
    const note = (await (
      await api.get(`/api/m/deliveries/${deliveryCode}`)
    ).json()) as {
      data: { version: string; lines: { id: string }[] };
    };
    const posted = await api.post(`/api/m/deliveries/${deliveryCode}/post`, {
      headers,
      data: {
        clientDraftId: randomUUID(),
        startedVersion: note.data.version,
        vehiclePlate: "51X-000.01",
        picks: note.data.lines.map((line) => ({
          lineId: line.id,
          condition: "GOOD",
          quantity: "1",
        })),
      },
    });
    expect(posted.ok()).toBe(true);
    const site = (await (
      await api.get(`/api/m/returns/contracts/${from}`)
    ).json()) as {
      data: {
        yards: { id: string }[];
        exchanges: { id: string; deliveryCode: string }[];
        items: { itemId: string; code: string }[];
      };
    };
    const exchange = site.data.exchanges.find(
      (row) => row.deliveryCode === deliveryCode,
    );
    const itemId =
      site.data.items.find((row) => row.code === ITEM)?.itemId ?? "";
    const returned = await api.post("/api/m/returns", {
      headers,
      data: {
        clientDraftId: randomUUID(),
        contractId: from,
        yardLocationId: site.data.yards[0]?.id,
        lines: [{ itemId, good: "1" }],
        exchangeId: exchange?.id,
      },
    });
    expect(returned.ok()).toBe(true);
    await phone.context().close();

    await page.goto(`/sales/contracts/${from}/deliveries`);
    await waitForHydration(page, DESKTOP_READY);
    const row = page
      .getByRole("listitem")
      .filter({
        has: page.getByRole("link", {
          name: `${deliveryCode} · Đợt`,
          exact: false,
        }),
      })
      .filter({ visible: true })
      .first();
    await expect(row.getByText("Đổi hàng", { exact: true })).toBeVisible();
    await expect(
      row.getByRole("link", { name: /^Thu hồi PTH-/ }),
    ).toBeVisible();
  });
});
