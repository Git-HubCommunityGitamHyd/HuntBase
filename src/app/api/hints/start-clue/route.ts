import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamClueOrder } from "@/db/schema";
import { requirePlayer } from "@/lib/auth/session";

const apiOrder = (o: typeof teamClueOrder.$inferSelect) => ({
  id: o.id,
  team_id: o.teamId,
  clue_id: o.clueId,
  step_index: o.stepIndex,
  clue_started_at: o.clueStartedAt?.toISOString() ?? null,
  hint_viewed: o.hintViewed,
  hint_viewed_at: o.hintViewedAt?.toISOString() ?? null,
  hint_viewed_by: o.hintViewedBy,
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlayer(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const { clue_order_id } = body;

    if (!clue_order_id) {
      return NextResponse.json(
        { success: false, message: "clue_order_id is required" },
        { status: 400 }
      );
    }

    const teamId = auth.teamId;

    const [existing] = await db
      .select()
      .from(teamClueOrder)
      .where(and(eq(teamClueOrder.id, clue_order_id), eq(teamClueOrder.teamId, teamId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ success: false, message: "Clue order not found for your team" }, { status: 404 });
    }

    if (existing.clueStartedAt) {
      return NextResponse.json({ success: true, message: "Clue already started", clue_order: apiOrder(existing) });
    }

    const [updated] = await db
      .update(teamClueOrder)
      .set({ clueStartedAt: new Date() })
      .where(and(eq(teamClueOrder.id, clue_order_id), eq(teamClueOrder.teamId, teamId)))
      .returning();

    return NextResponse.json({ success: true, message: "Clue started", clue_order: apiOrder(updated) });
  } catch (error) {
    console.error("Start clue error:", error);
    return NextResponse.json({ success: false, message: "Failed to start clue" }, { status: 500 });
  }
}
