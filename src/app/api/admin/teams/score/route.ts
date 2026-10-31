import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teams } from "@/db/schema";

export async function POST(request: NextRequest) {
  try {
    const { team_id, adjustment } = await request.json();
    if (!team_id || typeof adjustment !== "number") {
      return NextResponse.json({ success: false, message: "Team ID and adjustment are required" }, { status: 400 });
    }
    if (adjustment % 5 !== 0) {
      return NextResponse.json({ success: false, message: "Adjustment must be a multiple of 5" }, { status: 400 });
    }
    const [team] = await db.select({ score: teams.score }).from(teams).where(eq(teams.id, team_id)).limit(1);
    if (!team) return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });
    const newScore = Math.max(0, team.score + adjustment);
    await db.update(teams).set({ score: newScore }).where(eq(teams.id, team_id));
    return NextResponse.json({ success: true, message: `Score adjusted by ${adjustment}`, new_score: newScore });
  } catch (error) {
    console.error("Adjust score error:", error);
    return NextResponse.json({ success: false, message: "Failed to adjust score" }, { status: 500 });
  }
}
