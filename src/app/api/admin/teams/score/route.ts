import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const { team_id, adjustment } = body;

    if (!team_id || typeof adjustment !== "number") {
      return NextResponse.json({ success: false, message: "Team ID and adjustment are required" }, { status: 400 });
    }
    if (adjustment % 5 !== 0) {
      return NextResponse.json({ success: false, message: "Adjustment must be a multiple of 5" }, { status: 400 });
    }

    const [team] = await db
      .select({ id: teams.id, organizationId: teams.organizationId })
      .from(teams)
      .where(eq(teams.id, team_id))
      .limit(1);

    if (!team) return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });

    // High-priority Issue 5: Organization isolation
    if (auth.role !== "super_admin" && team.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You cannot modify teams from another organization" },
        { status: 403 }
      );
    }

    // Additional Issue 8: Atomic SQL update clamped at zero to prevent race conditions
    const [updated] = await db
      .update(teams)
      .set({
        score: sql`GREATEST(0, ${teams.score} + ${adjustment})`,
      })
      .where(eq(teams.id, team_id))
      .returning({ id: teams.id, score: teams.score });

    return NextResponse.json({
      success: true,
      message: `Score adjusted by ${adjustment}`,
      new_score: updated.score,
    });
  } catch (error) {
    console.error("Adjust score error:", error);
    return NextResponse.json({ success: false, message: "Failed to adjust score" }, { status: 500 });
  }
}
