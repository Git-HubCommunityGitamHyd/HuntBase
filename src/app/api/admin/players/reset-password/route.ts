import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const { player_id, new_password } = body;

    if (!player_id || typeof new_password !== "string") {
      return NextResponse.json({ success: false, message: "Player ID and new password are required" }, { status: 400 });
    }
    if (new_password.length < 4) {
      return NextResponse.json({ success: false, message: "Password must be at least 4 characters" }, { status: 400 });
    }

    const [player] = await db
      .select({
        id: teamMembers.id,
        playerName: teamMembers.playerName,
        username: teamMembers.username,
        organizationId: teams.organizationId,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.id, player_id))
      .limit(1);

    if (!player) {
      return NextResponse.json({ success: false, message: "Player not found" }, { status: 404 });
    }

    // High-priority Issue 5: Organization isolation
    if (auth.role !== "super_admin" && player.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You cannot reset passwords for players from another organization" },
        { status: 403 }
      );
    }

    // High-priority Issue 9: Use scrypt hashing helper consistently with authentication
    const scryptHash = await hashPassword(new_password);
    await db.update(teamMembers).set({ passwordHash: scryptHash }).where(eq(teamMembers.id, player_id));

    return NextResponse.json({ success: true, message: `Password reset for ${player.playerName} (@${player.username})` });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ success: false, message: "Failed to reset password" }, { status: 500 });
  }
}
