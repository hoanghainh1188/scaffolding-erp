import { useEffect } from "react";

const TEXT_FIELDS = "input, textarea, select";

function isCovered(element: Element, viewport: VisualViewport): boolean {
  return (
    element.getBoundingClientRect().bottom >
    viewport.offsetTop + viewport.height
  );
}

function reveal(element: Element): void {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  element.scrollIntoView({
    block: "center",
    behavior: reduceMotion ? "auto" : "smooth",
  });
}

/**
 * When the on-screen keyboard opens, scroll the focused field above it.
 * Uses visualViewport because iOS Safari keeps window.innerHeight unchanged.
 * Mounted once in MobileShell, so every form under /m gets it (design D14).
 */
export function useKeepFocusedInputVisible(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const check = () => {
      const active = document.activeElement;
      if (
        active instanceof Element &&
        active.matches(TEXT_FIELDS) &&
        isCovered(active, viewport)
      ) {
        reveal(active);
      }
    };

    document.addEventListener("focusin", check);
    viewport.addEventListener("resize", check);
    return () => {
      document.removeEventListener("focusin", check);
      viewport.removeEventListener("resize", check);
    };
  }, []);
}
