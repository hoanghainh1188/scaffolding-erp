"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "./auth";
import { LOGIN_PATH } from "./paths";

/** Ends the session on the server, clears the cookie, goes to /login. */
export async function signOutAction(): Promise<never> {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch (error: unknown) {
    // Already signed out (or the session vanished): still leave the app.
    console.error("[auth] sign-out failed", error);
  }
  redirect(LOGIN_PATH);
}
