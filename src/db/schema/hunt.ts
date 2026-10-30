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
import { events } from "./events";

export const clues = pgTable(
  "clues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    clueText: text("clue_text").notNull(),
    hintText: text("hint_text"),
    // Private: must never be sent to players.
    locationName: text("location_name"),
    adminNotes: text("admin_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("clues_step_number_check", sql`${t.stepNumber} >= 1`),
    uniqueIndex("clues_event_step_idx").on(t.eventId, t.stepNumber),
  ]
);

export const qrCodes = pgTable(
  "qr_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    // NULL for decoys.
    clueId: uuid("clue_id").references(() => clues.id, { onDelete: "cascade" }),
    qrToken: text("qr_token").notNull().unique(),
    isFake: boolean("is_fake").notNull().default(false),
    redirectUrl: text("redirect_url"),
    fakeLabel: text("fake_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A real QR must point at a clue; a decoy must not.
    check(
      "qr_codes_kind_check",
      sql`(${t.isFake} and ${t.clueId} is null) or (not ${t.isFake} and ${t.clueId} is not null)`
    ),
    index("qr_codes_event_idx").on(t.eventId),
    index("qr_codes_clue_idx").on(t.clueId),
  ]
);