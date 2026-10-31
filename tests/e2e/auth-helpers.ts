import { expect, type Browser, type Page } from "@playwright/test";

import type { Role } from "@/domain/role";
import { E2E_TEMP_PREFIX } from "@/lib/users/e2e-accounts";

export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";

/** Saved browser state of the e2e account with this role. */
export function statePath(role: Role): string {
  return `tests/e2e/.auth/${role}.json`;
}

export const SIGNED_OUT = { cookies: [], origins: [] };

export async function signInThroughForm(
  page: Page,
  username: string,
  password: string,
  options: { remember?: boolean; path?: string } = {},
): Promise<void> {
  await page.goto(options.path ?? "/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  if (options.remember) {
    await page
      .getByRole("checkbox", { name: "Giữ đăng nhập trên máy này" })
      .check();
  }
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

let counter = 0;

/** A login name for a throwaway account; global setup removes these. */
export function tempUsername(): string {
  counter += 1;
  return `${E2E_TEMP_PREFIX}${Date.now().toString(36)}${counter}`;
}

/** A fresh browser context with nobody signed in. */
export async function signedOutPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  return context.newPage();
}

/**
 * As Giám đốc on D17: creates an account and returns the temporary
 * password from the one-time dialog.
 */
export async function createAccount(
  page: Page,
  input: { name: string; username: string; role: string },
): Promise<string> {
  await page.goto("/settings/users");
  const form = page.getByRole("region", { name: "Thêm người dùng" });
  await form.getByLabel("Họ tên").fill(input.name);
  await form.getByLabel("Tên đăng nhập").fill(input.username);
  const radio = form.getByRole("radio", { name: input.role });
  if (!(await radio.isVisible())) {
    await form.getByRole("button", { name: "Xem cả 5 vai trò" }).click();
  }
  await radio.check();
  await form.getByRole("button", { name: "Tạo tài khoản" }).click();
  const dialog = page.getByRole("dialog", { name: "Đã tạo tài khoản" });
  await expect(dialog).toBeVisible();
  const password =
    (await dialog.getByTestId("temp-password").textContent()) ?? "";
  expect(password).toMatch(/^[a-z]{3,6}-\d{4}$/);
  return password;
}

export async function expireTempPassword(username: string): Promise<void> {
  const { createDatabase } = await import("@/db/client");
  const { sql } = await import("drizzle-orm");
  const { getEnv } = await import("@/lib/env");
  const env = getEnv();
  const { db, close } = createDatabase(env.DATABASE_URL);
  try {
    await db.execute(
      sql`UPDATE "user" SET "temp_password_expires_at" = now() - interval '1 second' WHERE "username" = ${username}`,
    );
  } finally {
    await close();
  }
}
