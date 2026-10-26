/** Envelope shared by every API route. */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export function ok<T>(data: T, status = 200): Response {
  const body: ApiResponse<T> = { success: true, data, error: null };
  return Response.json(body, { status });
}

/** `message` is shown to users: Vietnamese, no internal details. */
export function fail<T = null>(
  message: string,
  status: number,
  data?: T,
): Response {
  const body: ApiResponse<T> = {
    success: false,
    data: data ?? null,
    error: message,
  };
  return Response.json(body, { status });
}
