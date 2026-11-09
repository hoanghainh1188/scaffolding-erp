// Better Auth setup (design D10). Every call into the library goes through
// src/lib/auth/, so an upgrade touches one folder.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor as twoFactorPlugin, username } from "better-auth/plugins";

import { getDatabase, type Database } from "@/db/client";
import {
  account,
  rateLimit,
  session,
  twoFactor,
  user,
  verification,
} from "@/db/schema";
import {
  TRUST_DEVICE_DAYS,
  TWO_FACTOR_CHALLENGE_SECONDS,
} from "@/domain/two-factor";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isValidUsername,
  normalizeUsername,
} from "@/domain/username";
import { getEnv } from "@/lib/env";

import { generateBackupCodes, hashedBackupCodeStore } from "./backup-codes";

const DAY_SECONDS = 24 * 60 * 60;
/** "Giữ đăng nhập" ticked: 30 days since last use, renewed at most daily. */
export const PERSISTENT_SESSION_SECONDS = 30 * DAY_SECONDS;
export const SESSION_UPDATE_AGE_SECONDS = DAY_SECONDS;

// Sign-in, password change and account changes run through our own code
// (D3, D11) so throttling and password rules always apply. Server-side
// auth.api calls are not affected by this list; only the HTTP router is.
const DISABLED_PATHS = [
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/username",
  "/sign-in/social",
  "/is-username-available",
  "/change-password",
  "/set-password",
  "/request-password-reset",
  "/forget-password",
  "/reset-password",
  "/update-user",
  "/delete-user",
  "/change-email",
  "/send-verification-email",
  "/verify-email",
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  // Every HTTP route of the twoFactor plugin (director-mfa design D2).
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/get-totp-uri",
  "/two-factor/verify-totp",
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
  "/two-factor/verify-backup-code",
  "/two-factor/generate-backup-codes",
];

export interface AuthConfig {
  db: Database;
  secret: string;
  baseURL: string;
}

export function createAuth({ db, secret, baseURL }: AuthConfig) {
  return betterAuth({
    appName: "Scaffolding ERP",
    secret,
    baseURL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification, rateLimit, twoFactor },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: true, input: false },
        status: {
          type: "string",
          required: true,
          defaultValue: "ACTIVE",
          input: false,
        },
        mustChangePassword: {
          type: "boolean",
          required: true,
          defaultValue: true,
          input: false,
        },
        lastLoginAt: { type: "date", required: false, input: false },
        lastLoginDevice: { type: "string", required: false, input: false },
        contractScope: {
          type: "string",
          required: true,
          defaultValue: "ALL",
          input: false,
        },
        systemAdmin: {
          type: "boolean",
          required: true,
          defaultValue: false,
          input: false,
        },
      },
    },
    session: {
      expiresIn: PERSISTENT_SESSION_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      // Off so a locked account loses its session on the next request (D5).
      cookieCache: { enabled: false },
      additionalFields: {
        persistent: {
          type: "boolean",
          required: true,
          defaultValue: true,
          input: false,
        },
      },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    disabledPaths: DISABLED_PATHS,
    plugins: [
      username({
        minUsernameLength: USERNAME_MIN_LENGTH,
        maxUsernameLength: USERNAME_MAX_LENGTH,
        usernameNormalization: normalizeUsername,
        usernameValidator: isValidUsername,
        // Validate "ThuHa" as "thuha".
        validationOrder: { username: "post-normalization" },
      }),
      twoFactorPlugin({
        twoFactorCookieMaxAge: TWO_FACTOR_CHALLENGE_SECONDS,
        trustDeviceMaxAge: TRUST_DEVICE_DAYS * DAY_SECONDS,
        backupCodeOptions: {
          customBackupCodesGenerate: generateBackupCodes,
          storeBackupCodes: hashedBackupCodeStore,
        },
      }),
      // Must stay last: lets server actions set the session cookie.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

// One instance per server process, including across dev hot reloads.
const globalForAuth = globalThis as typeof globalThis & { __erpAuth?: Auth };

/** The app's Better Auth instance, created on first use. */
export function getAuth(): Auth {
  if (!globalForAuth.__erpAuth) {
    const env = getEnv();
    globalForAuth.__erpAuth = createAuth({
      db: getDatabase(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
    });
  }
  return globalForAuth.__erpAuth;
}
