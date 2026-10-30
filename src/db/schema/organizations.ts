import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),
  contactEmail: text("contact_email"),
  isVerified: boolean("is_verified").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hostUsers = pgTable(
  "host_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Super admins have no organization, so this stays nullable.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    email: text("email").notNull().unique(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    role: text("role").notNull().default("club_admin"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("host_users_role_check", sql`${t.role} in ('super_admin', 'club_admin')`),
    index("host_users_organization_idx").on(t.organizationId),
  ]
);

export const themeConfigs = pgTable(
  "theme_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),
    presetId: text("preset_id").notNull().default("cyber-matrix"),
    primaryColor: text("primary_color").notNull().default("#10b981"),
    secondaryColor: text("secondary_color").notNull().default("#064e3b"),
    accentColor: text("accent_color").notNull().default("#34d399"),
    backgroundColor: text("background_color").notNull().default("#09090b"),
    cardColor: text("card_color").notNull().default("#18181b"),
    textColor: text("text_color").notNull().default("#fafafa"),
    borderRadius: text("border_radius").notNull().default("0.5rem"),
    fontFamily: text("font_family").notNull().default("Inter"),
    bannerUrl: text("banner_url"),
    customCss: text("custom_css"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "theme_configs_preset_check",
      sql`${t.presetId} in ('cyber-matrix', 'neon-kahoot', 'parchment-quest', 'arcade-80s', 'minimalist-mono', 'custom')`
    ),
  ]
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => hostUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Replaces the old true/false "used" column: NULL = not used yet.
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("password_reset_tokens_hash_idx").on(t.tokenHash)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Only a hash of the cookie value is stored, never the value itself.
    tokenHash: text("token_hash").notNull(),
    // Admin sessions now. A player/team-member column is added in Group C.
    hostUserId: uuid("host_user_id").references(() => hostUsers.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_host_user_idx").on(t.hostUserId),
    index("sessions_expires_idx").on(t.expiresAt),
  ]
);