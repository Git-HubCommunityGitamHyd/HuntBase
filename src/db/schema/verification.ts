import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { teamMembers } from "./teams";

export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamMemberId: uuid("team_member_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    // HMAC of the code, never the code itself.
    otpHash: text("otp_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("email_verifications_attempts_check", sql`${t.attempts} >= 0`),
    // A player can have at most one unused code at a time.
    uniqueIndex("email_verifications_one_active_idx")
      .on(t.teamMemberId)
      .where(sql`${t.consumedAt} is null`),
    index("email_verifications_member_time_idx").on(t.teamMemberId, t.createdAt),
  ]
);