import { count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { new_team_id } = body;
    if (!id || !new_team_id) {
      return NextResponse.json({ success: false, message: "Player ID and new team ID required" }, { status: 400 });
    }

    // Verify player exists and get their organization
    const [player] = await db
      .select({ id: teamMembers.id, organizationId: teams.organizationId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.id, id))
      .limit(1);

    if (!player) return NextResponse.json({ success: false, message: "Player not found" }, { status: 404 });

    // Verify target team exists and get organization
    const [target] = await db
      .select({ id: teams.id, maxPlayers: teams.maxPlayers, organizationId: teams.organizationId })
      .from(teams)
      .where(eq(teams.id, new_team_id))
      .limit(1);

    if (!target) return NextResponse.json({ success: false, message: "Target team not found" }, { status: 404 });

    // High-priority Issue 5: Organization isolation
    if (auth.role !== "super_admin") {
      if (player.organizationId !== auth.organizationId || target.organizationId !== auth.organizationId) {
        return NextResponse.json(
          { success: false, message: "Forbidden: You cannot move players across organizations" },
          { status: 403 }
        );
      }
    }

    const [{ members }] = await db.select({ members: count() }).from(teamMembers).where(eq(teamMembers.teamId, new_team_id));
    if (members >= target.maxPlayers) {
      return NextResponse.json({ success: false, message: "Target team is full" }, { status: 400 });
    }

    await db.update(teamMembers).set({ teamId: new_team_id }).where(eq(teamMembers.id, id));
    return NextResponse.json({ success: true, message: "Player moved successfully" });
  } catch (error) {
    console.error("Player move error:", error);
    return NextResponse.json({ success: false, message: "Failed to move player" }, { status: 500 });
  }
}
