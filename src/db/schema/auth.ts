// Tables for sign-in (auth-and-roles, design D10). user/session/account/
// verification/rate_limit follow Better Auth's model; the JS keys are the
// field names its drizzle adapter looks up. The rest is ours.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Better Auth needs a unique email; we store <username>@users.invalid.
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Lower-case login name, fixed once the account exists.
    username: text("username").notNull().unique(),
    displayUsername: text("display_username"),
    role: text("role").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastLoginDevice: text("last_login_device"),
    ...timestamps,
  },
  (table) => [
    check(
      "user_role_check",
      sql`${table.role} in ('DIRECTOR', 'ACCOUNTANT', 'SALES', 'WAREHOUSE', 'WORKSHOP')`,
    ),
    check("user_status_check", sql`${table.status} in ('ACTIVE', 'LOCKED')`),
    check(
      "user_last_login_device_check",
      sql`${table.lastLoginDevice} in ('DESKTOP', 'MOBILE')`,
    ),
    check(
      "user_username_lower_check",
      sql`${table.username} = lower(${table.username})`,
    ),
    index("user_role_status_idx").on(table.role, table.status),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // false: "Giữ đăng nhập" was not ticked; the session ends 12 h after
    // sign-in (design D1).
    persistent: boolean("persistent").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    // Password hash (scrypt); never the password itself.
    password: text("password"),
    ...timestamps,
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

/** Better Auth's own limiter for /api/auth/* routes. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** Failed sign-ins per login name, existing or not (design D3). */
export const loginThrottle = pgTable("login_throttle", {
  usernameKey: text("username_key").primaryKey(),
  failedCount: integer("failed_count").notNull(),
  firstFailedAt: timestamp("first_failed_at", { withTimezone: true }).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

/** Sign-in attempts per IP address, fixed one-minute windows (design D3). */
export const authRateLimit = pgTable("auth_rate_limit", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
