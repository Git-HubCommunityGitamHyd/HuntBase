import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("event_id");
    if (!eventId) return NextResponse.json({ success: false, message: "Event ID is required" }, { status: 400 });
    const players = await db.select({ teamName: teams.teamName, playerName: teamMembers.playerName, username: teamMembers.username, createdAt: teamMembers.createdAt })
      .from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(eq(teams.eventId, eventId)).orderBy(asc(teamMembers.createdAt));
    const csvEscape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [["Team Name", "Player Name", "Username", "Registered At"], ...players.map(p => [p.teamName, p.playerName, p.username, p.createdAt.toLocaleString()])];
    const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="players_${new Date().toISOString().slice(0, 10)}.csv"` } });
  } catch (error) {
    console.error("Export players error:", error);
    return NextResponse.json({ success: false, message: "Failed to export players" }, { status: 500 });
  }
}
