import { and, count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events, teamClueOrder, teams } from "@/db/schema";
import { requirePlayer } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    // High-priority Issue 3: Authenticate request and derive team from verified player session
    const auth = await requirePlayer(request);
    if (auth instanceof NextResponse) return auth;

    const teamId = auth.teamId;

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });

    const [event] = await db.select().from(events).where(eq(events.id, team.eventId)).limit(1);
    if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

    const [{ totalClues }] = await db.select({ totalClues: count() }).from(clues).where(eq(clues.eventId, team.eventId));

    const eventApi = {
      id: event.id,
      name: event.name,
      is_active: event.isActive,
      hunt_status: event.huntStatus,
      start_time: event.startTime.toISOString(),
      end_time: event.endTime.toISOString(),
      hunt_started_at: event.huntStartedAt?.toISOString() ?? null,
      hunt_duration_minutes: event.huntDurationMinutes,
      hint_delay_minutes: event.hintDelayMinutes,
    };

    if (team.currentStep >= totalClues || team.huntFinishedAt) {
      return NextResponse.json({
        success: true,
        isComplete: true,
        totalClues,
        currentStep: team.currentStep,
        score: team.score,
        event: eventApi,
      });
    }

    let [order] = await db
      .select()
      .from(teamClueOrder)
      .where(and(eq(teamClueOrder.teamId, team.id), eq(teamClueOrder.stepIndex, team.currentStep)))
      .limit(1);

    if (!order) {
      return NextResponse.json({ success: false, message: "Clue assignment not found for this step" }, { status: 404 });
    }

    if (!order.clueStartedAt) {
      [order] = await db
        .update(teamClueOrder)
        .set({ clueStartedAt: new Date() })
        .where(eq(teamClueOrder.id, order.id))
        .returning();
    }

    const [clue] = await db.select().from(clues).where(eq(clues.id, order.clueId)).limit(1);
    if (!clue) return NextResponse.json({ success: false, message: "Clue content not found" }, { status: 404 });

    // Strips admin_notes and location_name so players cannot inspect DevTools to cheat
    return NextResponse.json({
      success: true,
      isComplete: false,
      clue: {
        id: clue.id,
        step_number: clue.stepNumber,
        clue_text: clue.clueText,
        has_hint: Boolean(clue.hintText),
        hint_text: order.hintViewed ? clue.hintText : null,
      },
      clueOrder: {
        id: order.id,
        step_index: order.stepIndex,
        clue_started_at: order.clueStartedAt?.toISOString() ?? null,
        hint_viewed: order.hintViewed,
        hint_viewed_at: order.hintViewedAt?.toISOString() ?? null,
      },
      totalClues,
      currentStep: team.currentStep,
      score: team.score,
      event: eventApi,
    });
  } catch (error) {
    console.error("current-clue endpoint error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
