"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/client";
import { getAuth } from "@/lib/auth/auth";
import { afterSignInPath, CHANGE_PASSWORD_PATH } from "@/lib/auth/paths";
import { signIn } from "@/lib/auth/sign-in";
import { getEnv } from "@/lib/env";

export interface SignInFormState {
  error: string | null;
  /** Typed name, kept so a wrong password does not clear it. */
  username: string;
}

const text = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

/** Form action of /login (spec auth: Đăng nhập bằng tên đăng nhập...). */
export async function signInAction(
  _previous: SignInFormState,
  form: FormData,
): Promise<SignInFormState> {
  const username = text(form, "username");
  const auth = getAuth();
  const result = await signIn(
    {
      db: getDatabase(),
      auth,
      ipLimitPerMinute: getEnv().AUTH_SIGN_IN_LIMIT_PER_MINUTE,
    },
    {
      username,
      password: text(form, "password"),
      remember: form.get("remember") === "on",
      headers: await headers(),
    },
  );
  if (!result.ok) {
    await clearSessionCookies(auth);
    return { error: result.error, username };
  }
  redirect(
    result.user.mustChangePassword
      ? CHANGE_PASSWORD_PATH
      : afterSignInPath(result.user.role, text(form, "next")),
  );
}

/**
 * A locked account's password check still makes Better Auth set a cookie
 * before we drop its session; remove it so the browser holds nothing.
 */
async function clearSessionCookies(auth: ReturnType<typeof getAuth>) {
  const { authCookies } = await auth.$context;
  const jar = await cookies();
  jar.delete(authCookies.sessionToken.name);
  jar.delete(authCookies.dontRememberToken.name);
}
