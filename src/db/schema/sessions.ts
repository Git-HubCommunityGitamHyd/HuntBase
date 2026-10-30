import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { hostUsers } from "./organizations";
import { teamMembers } from "./teams";

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Only a hash of the cookie value is stored, never the value itself.
    tokenHash: text("token_hash").notNull(),
    // Exactly one of these is set: an admin or a player.
    hostUserId: uuid("host_user_id").references(() => hostUsers.id, {
      onDelete: "cascade",
    }),
    teamMemberId: uuid("team_member_id").references(() => teamMembers.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "sessions_one_owner_check",
      sql`(${t.hostUserId} is not null) <> (${t.teamMemberId} is not null)`
    ),
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_host_user_idx").on(t.hostUserId),
    index("sessions_team_member_idx").on(t.teamMemberId),
    index("sessions_expires_idx").on(t.expiresAt),
  ]
);