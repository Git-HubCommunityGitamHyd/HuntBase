import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eventPauses, events, teamClueOrder, teams } from "@/db/schema";
import { requirePlayer } from "@/lib/auth/session";
import { validateHuntActiveState } from "@/lib/gameplay/hunt-lifecycle";

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

    // Reject forged / mismatched client-supplied identity fields
    if (body.team_id && body.team_id !== auth.teamId) {
      return NextResponse.json({ success: false, message: "Forbidden: Mismatched team identity" }, { status: 403 });
    }
    if (body.teamId && body.teamId !== auth.teamId) {
      return NextResponse.json({ success: false, message: "Forbidden: Mismatched team identity" }, { status: 403 });
    }
    if (body.player_id && body.player_id !== auth.id) {
      return NextResponse.json({ success: false, message: "Forbidden: Mismatched player identity" }, { status: 403 });
    }
    if (body.playerId && body.playerId !== auth.id) {
      return NextResponse.json({ success: false, message: "Forbidden: Mismatched player identity" }, { status: 403 });
    }

    const { clue_order_id } = body;
    if (!clue_order_id) {
      return NextResponse.json(
        { success: false, message: "clue_order_id is required" },
        { status: 400 }
      );
    }

    const teamId = auth.teamId;

    const [team] = await db
      .select({ id: teams.id, isDisqualified: teams.isDisqualified, event: events })
      .from(teams)
      .innerJoin(events, eq(events.id, teams.eventId))
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });
    }

    if (team.isDisqualified) {
      return NextResponse.json({ success: false, message: "Team is disqualified" }, { status: 403 });
    }

    const now = new Date();
    const pauses = await db
      .select({ pausedAt: eventPauses.pausedAt, resumedAt: eventPauses.resumedAt })
      .from(eventPauses)
      .where(eq(eventPauses.eventId, team.event.id));

    // Reject starting clue if hunt is completed, paused, or not active
    const validation = validateHuntActiveState(team.event, pauses, now);
    if (!validation.allowed) {
      return NextResponse.json({ success: false, message: validation.message }, { status: validation.status });
    }

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
      .set({ clueStartedAt: now })
      .where(and(eq(teamClueOrder.id, clue_order_id), eq(teamClueOrder.teamId, teamId)))
      .returning();

    return NextResponse.json({ success: true, message: "Clue started", clue_order: apiOrder(updated) });
  } catch (error) {
    console.error("Start clue error:", error);
    return NextResponse.json({ success: false, message: "Failed to start clue" }, { status: 500 });
  }
}
