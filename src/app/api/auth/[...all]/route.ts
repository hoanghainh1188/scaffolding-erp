import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth/auth";

// Better Auth's own routes (get-session, sign-out). Sign-in and password
// changes are disabled here and run through src/lib/auth (design D10).
const handler = (request: Request): Promise<Response> =>
  getAuth().handler(request);

export const { GET, POST } = toNextJsHandler(handler);
