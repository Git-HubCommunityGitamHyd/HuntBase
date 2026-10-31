import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teams } from "@/db/schema";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, message: "Team ID is required" }, { status: 400 });
    }

    const [row] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (!row) {
      return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });
    }

    const team = {
      id: row.id,
      organization_id: row.organizationId,
      event_id: row.eventId,
      team_name: row.teamName,
      username: null,
      password_hash: null,
      score: row.score,
      is_disqualified: row.isDisqualified,
      current_step: row.currentStep,
      is_admin: false,
      created_at: row.createdAt.toISOString(),
      min_players: row.minPlayers,
      max_players: row.maxPlayers,
      registration_status: row.registrationStatus,
      hunt_finished_at: row.huntFinishedAt?.toISOString() ?? null,
    };

    return NextResponse.json({ success: true, team });
  } catch (error) {
    console.error("Fetch team error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch team" }, { status: 500 });
  }
}
