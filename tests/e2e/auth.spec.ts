import { expect, test } from "@playwright/test";

import {
  E2E_PASSWORD,
  SIGNED_OUT,
  createAccount,
  expireTempPassword,
  signInThroughForm,
  signedOutPage,
  statePath,
  tempUsername,
} from "./auth-helpers";
import {
  DESKTOP_READY,
  MOBILE_READY,
  expectNoHorizontalScroll,
  runOnlyIn,
  waitForHydration,
} from "./helpers";

test.describe("sign-in page", () => {
  test.use({ storageState: SIGNED_OUT });

  test("sends a signed-out visitor to /login and back after sign-in", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop flow");
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/login\?next=%2Finventory$/);
    await page.getByLabel("Tên đăng nhập").fill("E2E.KinhDoanh");
    await page.getByLabel("Mật khẩu", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(page.locator("header")).toContainText("Kinh doanh");
  });

  test("shows one message for a wrong password and keeps the name", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop flow");
    await signInThroughForm(page, "e2e.ketoan", "sai-mat-khau");
    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "Tên đăng nhập hoặc mật khẩu không đúng",
    );
    await expect(page.getByLabel("Tên đăng nhập")).toHaveValue("e2e.ketoan");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Mật khẩu", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("lands Thủ kho on the phone area", async ({ page }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "mobile-375"), "phone flow");
    await signInThroughForm(page, "e2e.thukho", E2E_PASSWORD, {
      remember: true,
    });
    await expect(page).toHaveURL(/\/m$/);
    await waitForHydration(page, MOBILE_READY);
  });

  test("does not scroll sideways at 360 and 1366px", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "sets its own viewport");
    for (const width of [360, 1366]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/login");
      await expectNoHorizontalScroll(page);
    }
  });
});

test.describe("signed in", () => {
  test("a signed-in visitor of /login goes to their home page", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop flow");
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("the user menu opens with the keyboard and signs out", async ({
    browser,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop header");
    // Own session: signing out must not end the shared director state.
    const page = await signedOutPage(browser);
    await signInThroughForm(page, "e2e.ketoan", E2E_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
    await waitForHydration(page, DESKTOP_READY);

    const trigger = page.getByRole("button", { name: /Thu Hà/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("menuitem", { name: "Đổi mật khẩu" }),
    ).toBeVisible();
    await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await page.context().close();
  });

  test("Cá nhân shows the account and signs out", async ({
    browser,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "mobile-375"), "phone tab");
    const page = await signedOutPage(browser);
    await signInThroughForm(page, "e2e.xuong", E2E_PASSWORD);
    await expect(page).toHaveURL(/\/m$/);
    await page.goto("/m/profile");
    const main = page.locator("main").filter({ visible: true });
    await expect(main).toContainText("Hoàng Nam");
    await expect(main).toContainText("e2e.xuong");
    await expect(main).toContainText("Xưởng");
    await main.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.context().close();
  });
});

test.describe("roles", () => {
  test.use({ storageState: statePath("ACCOUNTANT") });

  test("Kế toán gets 403 on the users page", async ({ page }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop flow");
    const response = await page.goto("/settings/users");
    // Next.js 16 streaming can return 200 before forbidden() takes over the streamed UI
    expect([200, 403]).toContain(response?.status());
    await expect(
      page.getByRole("heading", { name: "Bạn không có quyền xem trang này" }),
    ).toBeVisible();
  });
});

test.describe("D17 and temporary passwords", () => {
  test("Giám đốc creates an account; its first sign-in must change the password", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop flow");
    const username = tempUsername();
    const password = await createAccount(page, {
      name: "Đức Lực",
      username,
      role: "Kinh doanh",
    });
    const dialog = page.getByRole("dialog", { name: "Đã tạo tài khoản" });
    await expect(dialog).toContainText("Đưa mật khẩu này cho Đức Lực");
    await dialog.getByRole("button", { name: "Xong" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(password)).toHaveCount(0);
    await expect(
      page.getByRole("row", { name: new RegExp(username) }),
    ).toContainText("Chưa đăng nhập");

    const newcomer = await signedOutPage(browser);
    await signInThroughForm(newcomer, username, password);
    await expect(newcomer).toHaveURL(/\/change-password$/);
    await newcomer.goto("/inventory");
    await expect(newcomer).toHaveURL(/\/change-password$/);

    await newcomer.getByLabel("Mật khẩu hiện tại").fill(password);
    await newcomer.getByLabel("Mật khẩu mới", { exact: true }).fill("kho123");
    await newcomer.getByLabel("Nhập lại mật khẩu mới").fill("kho123");
    await newcomer.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await expect(newcomer.locator("form").getByRole("alert")).toHaveText(
      "Mật khẩu mới phải có ít nhất 8 ký tự",
    );

    await newcomer
      .getByLabel("Mật khẩu mới", { exact: true })
      .fill("bai sau kho");
    await newcomer.getByLabel("Nhập lại mật khẩu mới").fill("bai sau kho");
    await newcomer.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await expect(newcomer).toHaveURL(/\/dashboard$/);
    await newcomer.context().close();
  });

  test("locking an account signs it out on its next tab change", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop flow");
    const username = tempUsername();
    const password = await createAccount(page, {
      name: "Ngọc Lâm",
      username,
      role: "Thủ kho",
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xong" })
      .click();

    // The warehouse worker signs in on "their phone" and sets a password.
    const phone = await signedOutPage(browser);
    await signInThroughForm(phone, username, password);
    await phone.getByLabel("Mật khẩu hiện tại").fill(password);
    await phone.getByLabel("Mật khẩu mới", { exact: true }).fill("bai sau kho");
    await phone.getByLabel("Nhập lại mật khẩu mới").fill("bai sau kho");
    await phone.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await expect(phone).toHaveURL(/\/m$/);
    await waitForHydration(phone, MOBILE_READY);

    // Giám đốc locks the account.
    await page.goto("/settings/users?role=WAREHOUSE");
    const row = page.getByRole("row", { name: new RegExp(username) });
    await row.getByRole("button", { name: /Thao tác/ }).click();
    await page.getByRole("menuitem", { name: "Khóa tài khoản" }).click();
    // The list pages 20 rows and puts locked accounts last; earlier runs keep
    // locked e2etmp* accounts (global setup), so once locked the row may sit
    // on another page. The answer of the lock command is what proves it.
    const locked = page.waitForResponse(
      (response) =>
        /\/api\/users\/[^/]+\/lock$/.test(response.url()) &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Khóa" })
      .click();
    const answer = await locked;
    expect(answer.ok()).toBe(true);
    expect(
      ((await answer.json()) as { data: { user: { status: string } } }).data
        .user.status,
    ).toBe("LOCKED");

    await phone
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("link", { name: "Lịch sử" })
      .click();
    await expect(phone).toHaveURL(/\/login/);
    await phone.context().close();
  });

  test("signing in with an expired temporary password shows error and shows warning badge on D17", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop flow");
    const username = tempUsername();
    const password = await createAccount(page, {
      name: "Đức Thịnh",
      username,
      role: "Thủ kho",
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xong" })
      .click();

    // Expire the temp password
    await expireTempPassword(username);

    // Attempt sign-in with expired password
    const newcomer = await signedOutPage(browser);
    await signInThroughForm(newcomer, username, password);
    await expect(newcomer.locator("form").getByRole("alert")).toHaveText(
      "Mật khẩu tạm đã hết hạn. Liên hệ Giám đốc để cấp lại",
    );
    await newcomer.context().close();

    // Back to Giám đốc on D17: reload and verify warning badge & action
    await page.reload();
    const row = page.getByRole("row", { name: new RegExp(username) });
    await expect(row).toContainText("Hết hạn mật khẩu tạm");
    await row.getByRole("button", { name: /Thao tác/ }).click();
    await expect(
      page.getByRole("menuitem", { name: "Cấp lại mật khẩu tạm" }),
    ).toBeVisible();
  });
});
