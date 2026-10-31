import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamClueOrder } from "@/db/schema";

const apiOrder = (o: typeof teamClueOrder.$inferSelect) => ({
  id: o.id, team_id: o.teamId, clue_id: o.clueId, step_index: o.stepIndex,
  clue_started_at: o.clueStartedAt?.toISOString() ?? null,
  hint_viewed: o.hintViewed, hint_viewed_at: o.hintViewedAt?.toISOString() ?? null,
  hint_viewed_by: o.hintViewedBy,
});

export async function POST(request: NextRequest) {
  try {
    const { team_id, clue_order_id } = await request.json();
    if (!team_id || !clue_order_id) return NextResponse.json({ success: false, message: "Team ID and Clue Order ID are required" }, { status: 400 });
    const [existing] = await db.select().from(teamClueOrder).where(and(eq(teamClueOrder.id, clue_order_id), eq(teamClueOrder.teamId, team_id))).limit(1);
    if (!existing) return NextResponse.json({ success: false, message: "Clue order not found" }, { status: 404 });
    if (existing.clueStartedAt) return NextResponse.json({ success: true, message: "Clue already started", clue_order: apiOrder(existing) });
    const [updated] = await db.update(teamClueOrder).set({ clueStartedAt: new Date() }).where(and(eq(teamClueOrder.id, clue_order_id), eq(teamClueOrder.teamId, team_id))).returning();
    return NextResponse.json({ success: true, message: "Clue started", clue_order: apiOrder(updated) });
  } catch (error) {
    console.error("Start clue error:", error);
    return NextResponse.json({ success: false, message: "Failed to start clue" }, { status: 500 });
  }
}
