import { count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { new_team_id } = await request.json();
    if (!id || !new_team_id) return NextResponse.json({ success: false, message: "Player ID and new team ID required" }, { status: 400 });
    const [target] = await db.select({ id: teams.id, maxPlayers: teams.maxPlayers }).from(teams).where(eq(teams.id, new_team_id)).limit(1);
    if (!target) return NextResponse.json({ success: false, message: "Target team not found" }, { status: 404 });
    const [{ members }] = await db.select({ members: count() }).from(teamMembers).where(eq(teamMembers.teamId, new_team_id));
    if (members >= target.maxPlayers) return NextResponse.json({ success: false, message: "Target team is full" }, { status: 400 });
    await db.update(teamMembers).set({ teamId: new_team_id }).where(eq(teamMembers.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Player move error:", error);
    return NextResponse.json({ success: false, message: "Failed to move player" }, { status: 500 });
  }
}
