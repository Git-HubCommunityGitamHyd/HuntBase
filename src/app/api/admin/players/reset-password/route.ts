import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { hashPassword } from "@/lib/utils/helpers";

export async function POST(request: NextRequest) {
  try {
    const { player_id, new_password } = await request.json();
    if (!player_id || typeof new_password !== "string") return NextResponse.json({ success: false, message: "Player ID and new password are required" }, { status: 400 });
    if (new_password.length < 4) return NextResponse.json({ success: false, message: "Password must be at least 4 characters" }, { status: 400 });
    const [player] = await db.select({ id: teamMembers.id, playerName: teamMembers.playerName, username: teamMembers.username }).from(teamMembers).where(eq(teamMembers.id, player_id)).limit(1);
    if (!player) return NextResponse.json({ success: false, message: "Player not found" }, { status: 404 });
    await db.update(teamMembers).set({ passwordHash: await hashPassword(new_password) }).where(eq(teamMembers.id, player_id));
    return NextResponse.json({ success: true, message: `Password reset for ${player.playerName} (@${player.username})` });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ success: false, message: "Failed to reset password" }, { status: 500 });
  }
}
