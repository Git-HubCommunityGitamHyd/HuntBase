import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    // Kept for now so existing code keeps working; hunt_status is the real state.
    isActive: boolean("is_active").notNull().default(false),

    huntStatus: text("hunt_status").notNull().default("draft"),
    huntStartedAt: timestamp("hunt_started_at", { withTimezone: true }),
    huntEndedAt: timestamp("hunt_ended_at", { withTimezone: true }),
    huntDurationMinutes: integer("hunt_duration_minutes").notNull().default(60),
    hintDelayMinutes: integer("hint_delay_minutes").notNull().default(5),

    defaultMinPlayers: integer("default_min_players").notNull().default(2),
    defaultMaxPlayers: integer("default_max_players").notNull().default(4),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "events_hunt_status_check",
      sql`${t.huntStatus} in ('draft', 'scheduled', 'active', 'paused', 'completed')`
    ),
    check("events_time_order_check", sql`${t.endTime} > ${t.startTime}`),
    check("events_duration_check", sql`${t.huntDurationMinutes} > 0`),
    check("events_hint_delay_check", sql`${t.hintDelayMinutes} >= 0`),
    check(
      "events_player_limits_check",
      sql`${t.defaultMinPlayers} >= 1 and ${t.defaultMinPlayers} <= ${t.defaultMaxPlayers}`
    ),
    index("events_organization_idx").on(t.organizationId),
  ]
);

// Each row is one pause. resumed_at stays NULL while the event is paused.
export const eventPauses = pgTable(
  "event_pauses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    pausedAt: timestamp("paused_at", { withTimezone: true }).notNull().defaultNow(),
    resumedAt: timestamp("resumed_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "event_pauses_order_check",
      sql`${t.resumedAt} is null or ${t.resumedAt} >= ${t.pausedAt}`
    ),
    // An event can have at most one pause that is still open.
    uniqueIndex("event_pauses_one_open_idx")
      .on(t.eventId)
      .where(sql`${t.resumedAt} is null`),
  ]
);