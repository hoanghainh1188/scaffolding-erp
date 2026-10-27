import type { ApiResponse } from "./api-response";

export const NETWORK_ERROR_MESSAGE =
  "Không gửi được. Kiểm tra kết nối mạng rồi thử lại.";

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      /** The form field the server named ("lines.0.quantity"), if any. */
      field?: string;
    };

/**
 * Calls one of our JSON routes from the browser and unwraps the envelope.
 * Errors come back as the server's Vietnamese message.
 */
export async function callApi<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers:
        init.body === undefined
          ? undefined
          : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }
  let body: ApiResponse<T> | null = null;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    body = null;
  }
  if (response.ok && body?.success) return { ok: true, data: body.data as T };
  const field = (body?.data as { field?: unknown } | null | undefined)?.field;
  return {
    ok: false,
    error: body?.error ?? NETWORK_ERROR_MESSAGE,
    ...(typeof field === "string" ? { field } : {}),
  };
}
