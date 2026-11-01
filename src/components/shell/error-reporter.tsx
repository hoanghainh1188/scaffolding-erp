"use client";

import { useEffect } from "react";

const RECENT_ERRORS_TTL_MS = 10_000;
const MAX_STORED_ERRORS = 20;

/**
 * Global client-side error reporter.
 * Listens for uncaught browser errors (`error`) and unhandled promise rejections (`unhandledrejection`),
 * deduplicates rapid repeats, and dispatches them to `/api/telemetry/errors`.
 */
export function ErrorReporter(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Cache to deduplicate frequent recurring errors in a short window
    const recentErrors = new Map<string, number>();

    function sendReport(payload: {
      message: string;
      name?: string;
      stack?: string;
      url?: string;
    }) {
      const now = Date.now();
      const errorKey = `${payload.name || ""}:${payload.message}:${payload.url || ""}`;

      const lastSent = recentErrors.get(errorKey);
      if (lastSent && now - lastSent < RECENT_ERRORS_TTL_MS) {
        return; // Debounce duplicate error
      }

      recentErrors.set(errorKey, now);
      if (recentErrors.size > MAX_STORED_ERRORS) {
        // Prune older keys
        const oldestKey = recentErrors.keys().next().value;
        if (oldestKey) recentErrors.delete(oldestKey);
      }

      const body = JSON.stringify({
        ...payload,
        source: "client",
        url: payload.url || window.location.href,
        timestamp: new Date().toISOString(),
      });

      // Use sendBeacon if available, otherwise fallback to keepalive fetch
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/telemetry/errors", blob);
      } else {
        fetch("/api/telemetry/errors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {
          // Ignore reporting transport errors
        });
      }
    }

    function handleError(event: ErrorEvent) {
      sendReport({
        message: event.message || "Uncaught browser error",
        name: event.error?.name,
        stack: event.error?.stack,
        url: window.location.href,
      });
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const isError = reason instanceof Error;
      sendReport({
        message: isError ? reason.message : String(reason || "Unhandled promise rejection"),
        name: isError ? reason.name : "UnhandledRejection",
        stack: isError ? reason.stack : undefined,
        url: window.location.href,
      });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
