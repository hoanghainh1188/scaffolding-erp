import { useSyncExternalStore } from "react";

/**
 * Below Tailwind `lg` (1024px) the desktop sidebar becomes a drawer
 * (design D12). Used by the shadcn sidebar.
 */
const DRAWER_QUERY = "(max-width: 1023.98px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(DRAWER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DRAWER_QUERY).matches,
    () => false,
  );
}
