/**
 * The desktop sidebar choice, saved only when the user toggles it
 * (design D12). Without it the window width decides, in CSS.
 */
export const SIDEBAR_COOKIE_NAME = "sidebar_state";

export type SidebarPreference = "expanded" | "collapsed";

export function parseSidebarPreference(
  value: string | undefined,
): SidebarPreference | null {
  return value === "expanded" || value === "collapsed" ? value : null;
}
