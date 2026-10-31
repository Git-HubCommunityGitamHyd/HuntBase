import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!id) return NextResponse.json({ success: false, message: "Player ID required" }, { status: 400 });

    const [player] = await db
      .select({ id: teamMembers.id, organizationId: teams.organizationId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.id, id))
      .limit(1);

    if (!player) {
      return NextResponse.json({ success: false, message: "Player not found" }, { status: 404 });
    }

    if (auth.role !== "super_admin" && player.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You cannot delete players from another organization" },
        { status: 403 }
      );
    }

    await db.delete(teamMembers).where(eq(teamMembers.id, id));
    return NextResponse.json({ success: true, message: "Player deleted successfully" });
  } catch (error) {
    console.error("Player delete error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete player" }, { status: 500 });
  }
}
