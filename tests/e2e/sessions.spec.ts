// Signed-in devices. Uses a throwaway account on purpose: signing out "every
// other device" of a shared e2e.* account would end the sessions the other
// workers are running on.
import { expect, test, type Page } from "@playwright/test";

import {
  createAccount,
  expectNoOverflowAt320,
  signInThroughForm,
  signedOutPage,
  tempUsername,
} from "./auth-helpers";
import { runOnlyIn } from "./helpers";

const NEW_PASSWORD = "bai sau kho";

async function expectSignedOut(page: Page): Promise<void> {
  await page.goto("/m/history");
  await expect(page).toHaveURL(/\/login/);
}

async function signIn(page: Page, username: string): Promise<void> {
  await signInThroughForm(page, username, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/m$/);
}

test.describe("signed-in devices", () => {
  test("lists devices and signs them out from afar", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "desktop-1280"), "desktop flow");
    test.slow();
    const username = tempUsername();
    const password = await createAccount(page, {
      name: "Văn Tùng",
      username,
      role: "Thủ kho",
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xong" })
      .click();

    const laptop = await signedOutPage(browser);
    await signInThroughForm(laptop, username, password);
    await laptop.getByLabel("Mật khẩu hiện tại").fill(password);
    await laptop.getByLabel("Mật khẩu mới", { exact: true }).fill(NEW_PASSWORD);
    await laptop.getByLabel("Nhập lại mật khẩu mới").fill(NEW_PASSWORD);
    await laptop.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await expect(laptop).toHaveURL(/\/m$/);

    const phone = await signedOutPage(browser);
    await signIn(phone, username);

    // One other device.
    await laptop.goto("/sessions");
    await expect(laptop.getByText("Máy này", { exact: true })).toHaveCount(1);
    await expect(laptop.getByText(/đăng nhập ở 2 thiết bị/)).toBeVisible();
    await expectNoOverflowAt320(laptop);
    await laptop.getByRole("button", { name: "Đăng xuất máy này" }).click();
    await laptop
      .getByRole("alertdialog")
      .getByRole("button", { name: "Đăng xuất" })
      .click();
    await expect(laptop.getByText(/đăng nhập ở 1 thiết bị/)).toBeVisible();
    await expect(
      laptop.getByRole("button", { name: "Đăng xuất mọi máy khác" }),
    ).toBeDisabled();
    await expectSignedOut(phone);

    // Every other device.
    await signIn(phone, username);
    await laptop.reload();
    await laptop
      .getByRole("button", { name: "Đăng xuất mọi máy khác" })
      .click();
    await laptop
      .getByRole("alertdialog")
      .getByRole("button", { name: "Đăng xuất 1 máy" })
      .click();
    await expect(laptop.getByText("Đã đăng xuất 1 máy.")).toBeVisible();
    await expectSignedOut(phone);

    // Giám đốc signs both out from D17; the account stays usable.
    await signIn(phone, username);
    await page.goto("/settings/users?role=WAREHOUSE");
    const row = page.getByRole("row", { name: new RegExp(username) });
    await row.getByRole("button", { name: /Thao tác/ }).click();
    await page.getByRole("menuitem", { name: "Đăng xuất mọi máy" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Nếu mật khẩu có thể đã lộ");
    await dialog.getByRole("button", { name: "Đăng xuất mọi máy" }).click();
    await expect(
      page.getByText(`Đã đăng xuất 2 máy của ${username}`),
    ).toBeVisible();
    await expectSignedOut(phone);
    await expectSignedOut(laptop);
    await signIn(phone, username);

    await phone.context().close();
    await laptop.context().close();
  });

  test("opens from the phone's profile tab and comes back", async ({
    page,
  }, testInfo) => {
    test.skip(!runOnlyIn(testInfo, "mobile-375"), "phone flow");
    await page.goto("/m/profile");
    await page.getByRole("link", { name: "Thiết bị đăng nhập" }).click();
    await expect(page).toHaveURL(/\/sessions\?from=m$/);
    await expect(
      page.getByRole("heading", { name: "Thiết bị đăng nhập" }),
    ).toBeVisible();
    await expect(page.getByText("Máy này", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Quay lại" }).click();
    await expect(page).toHaveURL(/\/m\/profile$/);
  });
});
