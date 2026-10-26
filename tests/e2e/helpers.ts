import { expect, type Page, type TestInfo } from "@playwright/test";

/** Tests that set their own viewport run in one project only. */
export function runOnlyIn(testInfo: TestInfo, ...projects: string[]): boolean {
  return projects.includes(testInfo.project.name);
}

/** Waits until React has hydrated the element matching `selector`. */
export async function waitForHydration(
  page: Page,
  selector: string,
): Promise<void> {
  await page.waitForFunction((sel) => {
    const element = document.querySelector(sel);
    return (
      !!element && Object.keys(element).some((key) => key.startsWith("__react"))
    );
  }, selector);
}

export const DESKTOP_READY = "[data-slot=sidebar-wrapper]";
export const MOBILE_READY = "nav[aria-label='Điều hướng chính'] a";

/** The page itself never scrolls sideways; wide content scrolls inside its frame. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    scrollWidth,
    `page scrolls sideways at ${innerWidth}px`,
  ).toBeLessThanOrEqual(innerWidth);
}

export async function sidebarState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const sidebar = document.querySelector(
      "[data-slot=sidebar]",
    ) as HTMLElement | null;
    if (!sidebar || sidebar.dataset.mobile === "true") return "drawer";
    return sidebar.dataset.state ?? "unknown";
  });
}
