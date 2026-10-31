import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";

export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get("team_id");
    const eventId = request.nextUrl.searchParams.get("event_id");
    if (!teamId && !eventId) return NextResponse.json({ success: false, message: "team_id or event_id required" }, { status: 400 });
    const rows = await db.select({
      id: teamMembers.id, team_id: teamMembers.teamId, player_name: teamMembers.playerName,
      username: teamMembers.username, password_hash: teamMembers.passwordHash,
      created_at: teamMembers.createdAt, is_verified: teamMembers.isVerified,
      gitam_email: teamMembers.gitamEmail, team_name: teams.teamName, event_id: teams.eventId,
    }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(teamId ? eq(teamMembers.teamId, teamId) : eq(teams.eventId, eventId!))
      .orderBy(asc(teamMembers.createdAt));
    return NextResponse.json({ success: true, data: rows.map(({ team_name, event_id, ...player }) => teamId ? player : { ...player, teams: { team_name, event_id } }) });
  } catch (error) {
    console.error("Players fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch players" }, { status: 500 });
  }
}
