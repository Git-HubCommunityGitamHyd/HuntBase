import {
  pgTable,
  uuid,
  boolean,
  integer,
  timestamp,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { events } from "./events";
import { teams, teamMembers } from "./teams";
import { clues, qrCodes } from "./hunt";

export const teamClueOrder = pgTable(
  "team_clue_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    clueId: uuid("clue_id")
      .notNull()
      .references(() => clues.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    clueStartedAt: timestamp("clue_started_at", { withTimezone: true }),
    hintViewed: boolean("hint_viewed").notNull().default(false),
    hintViewedAt: timestamp("hint_viewed_at", { withTimezone: true }),
    hintViewedBy: uuid("hint_viewed_by").references(() => teamMembers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("team_clue_order_team_clue_uq").on(t.teamId, t.clueId),
    unique("team_clue_order_team_step_uq").on(t.teamId, t.stepIndex),
    check("team_clue_order_step_check", sql`${t.stepIndex} >= 0`),
    check(
      "team_clue_order_hint_check",
      sql`not ${t.hintViewed} or ${t.hintViewedAt} is not null`
    ),
    index("team_clue_order_clue_idx").on(t.clueId),
  ]
);

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    clueId: uuid("clue_id")
      .notNull()
      .references(() => clues.id, { onDelete: "cascade" }),
    qrCodeId: uuid("qr_code_id")
      .notNull()
      .references(() => qrCodes.id, { onDelete: "cascade" }),
    scannedBy: uuid("scanned_by").references(() => teamMembers.id, {
      onDelete: "set null",
    }),
    hintWasUsed: boolean("hint_was_used").notNull().default(false),
    pointsAwarded: integer("points_awarded").notNull().default(10),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The anti-double-scan rule: one verified scan per team per clue.
    unique("scans_team_clue_uq").on(t.teamId, t.clueId),
    check("scans_points_check", sql`${t.pointsAwarded} >= 0`),
    // Leaderboard: latest scan time per team within an event.
    index("scans_event_team_time_idx").on(t.eventId, t.teamId, t.scannedAt),
  ]
);

export const fakeQrScans = pgTable(
  "fake_qr_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    qrCodeId: uuid("qr_code_id")
      .notNull()
      .references(() => qrCodes.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fake_qr_scans_event_time_idx").on(t.eventId, t.scannedAt)]
);