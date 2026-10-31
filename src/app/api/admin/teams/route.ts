import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, teams } from "@/db/schema";

const apiTeam = (t: typeof teams.$inferSelect) => ({
  id: t.id, organization_id: t.organizationId, event_id: t.eventId, team_name: t.teamName,
  username: null, password_hash: null, score: t.score, is_disqualified: t.isDisqualified,
  current_step: t.currentStep, is_admin: false, created_at: t.createdAt.toISOString(),
  min_players: t.minPlayers, max_players: t.maxPlayers, registration_status: t.registrationStatus,
  hunt_finished_at: t.huntFinishedAt?.toISOString() ?? null,
});

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("event_id");
    const rows = await db.select().from(teams).where(eventId ? eq(teams.eventId, eventId) : undefined).orderBy(asc(teams.createdAt));
    return NextResponse.json({ success: true, data: rows.map(apiTeam) });
  } catch (error) {
    console.error("Teams fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch teams" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { event_id, team_name, min_players = 2, max_players = 2 } = await request.json();
    if (!event_id || !team_name) return NextResponse.json({ success: false, message: "Event ID and team name are required" }, { status: 400 });
    const [event] = await db.select({ organizationId: events.organizationId }).from(events).where(eq(events.id, event_id)).limit(1);
    if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
    const [row] = await db.insert(teams).values({ eventId: event_id, organizationId: event.organizationId, teamName: team_name, minPlayers: min_players, maxPlayers: max_players }).returning();
    return NextResponse.json({ success: true, data: apiTeam(row) });
  } catch (error) {
    console.error("Team create error:", error);
    return NextResponse.json({ success: false, message: "Failed to create team" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, ...input } = await request.json();
    if (!id) return NextResponse.json({ success: false, message: "Team ID required" }, { status: 400 });
    const values: Partial<typeof teams.$inferInsert> = {};
    if (input.team_name !== undefined) values.teamName = input.team_name;
    if (input.score !== undefined) values.score = input.score;
    if (input.is_disqualified !== undefined) values.isDisqualified = input.is_disqualified;
    if (input.current_step !== undefined) values.currentStep = input.current_step;
    if (input.min_players !== undefined) values.minPlayers = input.min_players;
    if (input.max_players !== undefined) values.maxPlayers = input.max_players;
    if (input.registration_status !== undefined) values.registrationStatus = input.registration_status;
    if (input.hunt_finished_at !== undefined) values.huntFinishedAt = input.hunt_finished_at ? new Date(input.hunt_finished_at) : null;
    await db.update(teams).set(values).where(eq(teams.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Team update error:", error);
    return NextResponse.json({ success: false, message: "Failed to update team" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "Team ID required" }, { status: 400 });
    await db.delete(teams).where(eq(teams.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Team delete error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete team" }, { status: 500 });
  }
}
