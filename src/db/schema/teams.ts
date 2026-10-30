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
import { events } from "./events";

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    teamName: text("team_name").notNull(),

    minPlayers: integer("min_players").notNull().default(2),
    maxPlayers: integer("max_players").notNull().default(4),
    registrationStatus: text("registration_status").notNull().default("open"),
    isDisqualified: boolean("is_disqualified").notNull().default(false),
    score: integer("score").notNull().default(0),
    currentStep: integer("current_step").notNull().default(0),
    huntFinishedAt: timestamp("hunt_finished_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("teams_current_step_check", sql`${t.currentStep} >= 0`),
    check(
      "teams_registration_status_check",
      sql`${t.registrationStatus} in ('open', 'full', 'closed')`
    ),
    check(
      "teams_player_limits_check",
      sql`${t.minPlayers} >= 1 and ${t.minPlayers} <= ${t.maxPlayers}`
    ),
    // Team names are unique per event, ignoring upper/lower case.
    uniqueIndex("teams_event_name_idx").on(t.eventId, sql`lower(${t.teamName})`),
    index("teams_event_idx").on(t.eventId),
    index("teams_organization_idx").on(t.organizationId),
  ]
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerName: text("player_name").notNull(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    gitamEmail: text("gitam_email"),
    isVerified: boolean("is_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("team_members_team_idx").on(t.teamId)]
);