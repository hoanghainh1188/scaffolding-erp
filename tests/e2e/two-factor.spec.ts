// Second factor from end to end (director-mfa). Accounts are throwaway ones
// global setup retires, each test enrols its own phone.
import { expect, test, type Page } from "@playwright/test";

import { totpCode } from "@/test/two-factor";

import {
  createAccount,
  E2E_PASSWORD,
  enrollThroughScreen,
  enterCode,
  expectNoOverflowAt320,
  flagSystemAdmin,
  signedOutPage,
  signInThroughForm,
  tempUsername,
} from "./auth-helpers";
import { runOnlyIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const PASSWORD = "chi cho thue";

async function firstSignIn(page: Page, username: string, temporary: string) {
  await signInThroughForm(page, username, temporary);
  await page.getByLabel("Mật khẩu hiện tại").fill(temporary);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(PASSWORD);
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
}

async function signOut(page: Page) {
  await page.context().clearCookies({ name: /session_token/ });
}

const newUsername = tempUsername;

test.describe("Xác thực 2 lớp", () => {
  test("Kế toán bị bắt bật, rồi đăng nhập phải có mã", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one desktop run");
    const username = newUsername();
    const temporary = await createAccount(page, {
      name: "Kế toán thử",
      username,
      role: "Kế toán",
    });

    const accountant = await signedOutPage(browser);
    await firstSignIn(accountant, username, temporary);
    await expect(accountant).toHaveURL(/\/two-factor$/);

    await accountant.goto("/dashboard");
    await expect(accountant).toHaveURL(/\/two-factor$/);

    const secret = await enrollThroughScreen(accountant, PASSWORD, {
      checkNarrow: true,
    });
    await expect(accountant).toHaveURL(/\/dashboard$/);

    await accountant.goto("/two-factor");
    await expect(accountant.getByText("Còn 10 mã dự phòng")).toBeVisible();
    await expectNoOverflowAt320(accountant);

    await signOut(accountant);
    await signInThroughForm(accountant, username, PASSWORD);
    const code = accountant.getByLabel("Mã 6 số");
    await expect(code).toBeVisible();

    await code.fill("000000");
    await accountant
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(accountant.locator("#code-error")).toContainText(
      "Mã xác thực không đúng",
    );

    await accountant
      .getByRole("checkbox", { name: /Tin thiết bị này 30 ngày/ })
      .check();
    await enterCode(accountant, secret);
    await expect(accountant).toHaveURL(/\/dashboard$/);

    // The device is trusted now: the password is enough.
    await signOut(accountant);
    await signInThroughForm(accountant, username, PASSWORD);
    await expect(accountant).toHaveURL(/\/dashboard$/);
    await accountant.context().close();
  });

  test("admin hệ thống gỡ 2 lớp cho người khác trên D17", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one desktop run");
    const targetName = newUsername();
    const targetTemporary = await createAccount(page, {
      name: "Người mất máy",
      username: targetName,
      role: "Kế toán",
    });
    const target = await signedOutPage(browser);
    await firstSignIn(target, targetName, targetTemporary);
    await enrollThroughScreen(target, PASSWORD);
    await expect(target).toHaveURL(/\/dashboard$/);

    const adminName = newUsername();
    const adminTemporary = await createAccount(page, {
      name: "Admin thử",
      username: adminName,
      role: "Kinh doanh",
    });
    await flagSystemAdmin(adminName);
    const admin = await signedOutPage(browser);
    await firstSignIn(admin, adminName, adminTemporary);
    const secret = await enrollThroughScreen(admin, PASSWORD);
    await expect(admin).toHaveURL(/\/dashboard$/);

    await admin.goto("/settings/users");
    await admin
      .getByRole("button", { name: "Thao tác với Người mất máy" })
      .first()
      .click();
    await expect(admin.getByRole("menuitem")).toHaveCount(1);
    await admin.getByRole("menuitem", { name: "Gỡ xác thực 2 lớp" }).click();

    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Mật khẩu của bạn").fill(PASSWORD);
    await dialog.getByLabel("Mã 6 số của bạn").fill(totpCode(secret));
    await dialog.getByRole("button", { name: "Gỡ 2 lớp" }).click();
    await expect(dialog).toBeHidden();

    await target.reload();
    await expect(target).toHaveURL(/\/login/);
    await signInThroughForm(target, targetName, PASSWORD);
    await expect(target).toHaveURL(/\/two-factor$/);
    await target.context().close();
    await admin.context().close();
  });

  test("E2E accounts really have it on", async ({ browser }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "one desktop run");
    const page = await signedOutPage(browser);
    await page.goto("/login");
    await page.getByLabel("Tên đăng nhập").fill("e2e.ketoan");
    await page.getByLabel("Mật khẩu", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page.getByLabel("Mã 6 số")).toBeVisible();
    await page.context().close();
  });
});
