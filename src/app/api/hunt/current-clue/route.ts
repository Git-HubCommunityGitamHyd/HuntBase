import { and, count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, eventPauses, events, teamClueOrder, teams } from "@/db/schema";
import { requirePlayer } from "@/lib/auth/session";
import { validateHuntActiveState } from "@/lib/gameplay/hunt-lifecycle";

export async function POST(request: NextRequest) {
  try {
    // High-priority Issue 3 & Critical Issue 1: Authenticate request and derive team from verified player session
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

    // Only auto-start clue if hunt is currently active
    const now = new Date();
    const pauses = await db
      .select({ pausedAt: eventPauses.pausedAt, resumedAt: eventPauses.resumedAt })
      .from(eventPauses)
      .where(eq(eventPauses.eventId, event.id));

    const validation = validateHuntActiveState(event, pauses, now);

    if (!order.clueStartedAt && validation.allowed) {
      [order] = await db
        .update(teamClueOrder)
        .set({ clueStartedAt: now })
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
