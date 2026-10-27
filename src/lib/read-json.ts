import type { z } from "zod";

import { fail } from "./api-response";

export const INVALID_BODY_MESSAGE = "Dữ liệu gửi lên không hợp lệ";

export type ReadJsonResult<T> =
  { ok: true; data: T } | { ok: false; response: Response };

/**
 * Parses a JSON body against `schema`. A body that is not JSON, or does not
 * match, becomes a 400 with the first issue's message when the schema gives
 * one in Vietnamese, else a generic message.
 */
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ReadJsonResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: fail(INVALID_BODY_MESSAGE, 400) };
  }
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const message = result.error.issues[0]?.message;
  const userFacing =
    message && /[À-ỹ]/.test(message) ? message : INVALID_BODY_MESSAGE;
  return { ok: false, response: fail(userFacing, 400) };
}
