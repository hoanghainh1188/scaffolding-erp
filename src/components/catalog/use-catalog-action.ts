"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/lib/api-client";

export interface CatalogAction {
  pending: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  /**
   * Calls the API and refreshes the page data. `{ data }` on success (data
   * may be null, e.g. after a delete), null on failure with `error` set.
   */
  run: <T>(
    path: string,
    init: { method: string; body?: unknown },
  ) => Promise<{ data: T } | null>;
}

/** One write to /api/catalog with its pending state and server message. */
export function useCatalogAction(): CatalogAction {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(
    path: string,
    init: { method: string; body?: unknown },
  ) {
    setPending(true);
    setError(null);
    const result = await callApi<T>(path, init);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    router.refresh();
    return { data: result.data };
  }

  return { pending, error, setError, run };
}
