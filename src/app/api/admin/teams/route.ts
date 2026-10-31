import { and, asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, teams } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

const apiTeam = (t: typeof teams.$inferSelect) => ({
  id: t.id,
  organization_id: t.organizationId,
  event_id: t.eventId,
  team_name: t.teamName,
  username: null,
  password_hash: null,
  score: t.score,
  is_disqualified: t.isDisqualified,
  current_step: t.currentStep,
  is_admin: false,
  created_at: t.createdAt.toISOString(),
  min_players: t.minPlayers,
  max_players: t.maxPlayers,
  registration_status: t.registrationStatus,
  hunt_finished_at: t.huntFinishedAt?.toISOString() ?? null,
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const eventId = request.nextUrl.searchParams.get("event_id");
    const conditions = [];
    if (eventId) conditions.push(eq(teams.eventId, eventId));

    if (auth.role !== "super_admin") {
      conditions.push(eq(teams.organizationId, auth.organizationId!));
    }

    const rows = await db
      .select()
      .from(teams)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(teams.createdAt));

    return NextResponse.json({ success: true, data: rows.map(apiTeam) });
  } catch (error) {
    console.error("Teams fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch teams" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const { event_id, team_name, min_players = 2, max_players = 2 } = body;
    if (!event_id || !team_name) {
      return NextResponse.json({ success: false, message: "Event ID and team name are required" }, { status: 400 });
    }

    const [event] = await db
      .select({ organizationId: events.organizationId })
      .from(events)
      .where(eq(events.id, event_id))
      .limit(1);

    if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

    if (auth.role !== "super_admin" && event.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You cannot create teams in another organization" },
        { status: 403 }
      );
    }

    const [row] = await db
      .insert(teams)
      .values({
        eventId: event_id,
        organizationId: event.organizationId,
        teamName: team_name,
        minPlayers: min_players,
        maxPlayers: max_players,
      })
      .returning();

    return NextResponse.json({ success: true, data: apiTeam(row) });
  } catch (error) {
    console.error("Team create error:", error);
    return NextResponse.json({ success: false, message: "Failed to create team" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const { id, ...input } = body;
    if (!id) return NextResponse.json({ success: false, message: "Team ID required" }, { status: 400 });

    const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (!team) return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });

    if (auth.role !== "super_admin" && team.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You cannot modify teams from another organization" },
        { status: 403 }
      );
    }

    const values: Partial<typeof teams.$inferInsert> = {};
    if (input.team_name !== undefined) values.teamName = input.team_name;
    if (input.score !== undefined) values.score = input.score;
    if (input.is_disqualified !== undefined) values.isDisqualified = input.is_disqualified;
    if (input.current_step !== undefined) values.currentStep = input.current_step;
    if (input.min_players !== undefined) values.minPlayers = input.min_players;
    if (input.max_players !== undefined) values.maxPlayers = input.max_players;
    if (input.registration_status !== undefined) values.registrationStatus = input.registration_status;

    await db.update(teams).set(values).where(eq(teams.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Team update error:", error);
    return NextResponse.json({ success: false, message: "Failed to update team" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "Team ID required" }, { status: 400 });

    const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (!team) return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });

    if (auth.role !== "super_admin" && team.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You cannot delete teams from another organization" },
        { status: 403 }
      );
    }

    await db.delete(teams).where(eq(teams.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Team delete error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete team" }, { status: 500 });
  }
}
