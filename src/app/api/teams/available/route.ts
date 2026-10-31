import { and, count, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, teamMembers, teams } from "@/db/schema";

// GET - Fetch teams with available slots for registration
export async function GET() {
  try {
    const availableTeams = await db
      .select({
        id: teams.id,
        team_name: teams.teamName,
        current_members: count(teamMembers.id),
        max_players: teams.maxPlayers,
      })
      .from(teams)
      .innerJoin(events, eq(events.id, teams.eventId))
      .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
      .where(and(eq(events.isActive, true), eq(teams.registrationStatus, "open")))
      .groupBy(teams.id)
      .having(lt(count(teamMembers.id), teams.maxPlayers));

    return NextResponse.json({ success: true, data: availableTeams });
  } catch (error) {
    console.error("Available teams fetch error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch teams" },
      { status: 500 }
    );
  }
}
