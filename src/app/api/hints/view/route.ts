import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, eventPauses, events, teamClueOrder, teams } from "@/db/schema";
import { requirePlayer } from "@/lib/auth/session";
import { calculateClueActiveElapsedMinutes, validateHuntActiveState } from "@/lib/gameplay/hunt-lifecycle";

export async function POST(request: NextRequest) {
    try {
        // High-priority Issue 3 & Critical Issue 1: Authenticate and derive player and team from verified session
        const auth = await requirePlayer(request);
        if (auth instanceof NextResponse) return auth;

        const body = await request.json().catch(() => ({}));

        // Reject client-supplied identity mismatches
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

        const { clue_id } = body;
        if (!clue_id) {
            return NextResponse.json(
                { success: false, message: "Clue ID is required" },
                { status: 400 }
            );
        }

        const teamId = auth.teamId;
        const playerId = auth.id;

        const [team] = await db
            .select({ id: teams.id, disqualified: teams.isDisqualified, event: events })
            .from(teams)
            .innerJoin(events, eq(events.id, teams.eventId))
            .where(eq(teams.id, teamId))
            .limit(1);

        if (!team) {
            return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });
        }

        if (team.disqualified) {
            return NextResponse.json({ success: false, message: "Team is disqualified" }, { status: 403 });
        }

        const now = new Date();

        // Fetch pauses for pause-adjusted lifecycle validation and timer calculation
        const pauses = await db
            .select({ pausedAt: eventPauses.pausedAt, resumedAt: eventPauses.resumedAt })
            .from(eventPauses)
            .where(eq(eventPauses.eventId, team.event.id));

        // Centralized hunt active check: rejects paused, completed, unstarted, and expired hunts
        const validation = validateHuntActiveState(team.event, pauses, now);
        if (!validation.allowed) {
            return NextResponse.json({ success: false, message: validation.message }, { status: validation.status });
        }

        const [order] = await db
            .select()
            .from(teamClueOrder)
            .where(and(eq(teamClueOrder.teamId, teamId), eq(teamClueOrder.clueId, clue_id)))
            .limit(1);

        if (!order) {
            return NextResponse.json({ success: false, message: "Clue order not found for your team" }, { status: 404 });
        }

        if (order.hintViewed) {
            const [clue] = await db
                .select({ hintText: clues.hintText })
                .from(clues)
                .where(eq(clues.id, clue_id))
                .limit(1);

            return NextResponse.json({
                success: true,
                message: "Hint already viewed",
                already_viewed: true,
                hint_text: clue?.hintText ?? null,
            });
        }

        // Enforce anti-cheat hint delay excluding paused time
        const delayMinutes = team.event.hintDelayMinutes ?? 5;
        const startedAt = order.clueStartedAt ?? now;
        const activeElapsedMinutes = calculateClueActiveElapsedMinutes(startedAt, now, pauses);

        if (activeElapsedMinutes < delayMinutes) {
            const remainingMinutes = Math.ceil(delayMinutes - activeElapsedMinutes);
            return NextResponse.json(
                { success: false, message: `Hint not available yet. Please wait ${remainingMinutes} more minute${remainingMinutes > 1 ? "s" : ""}.` },
                { status: 400 }
            );
        }

        // Mark hint as viewed by the verified player
        await db
            .update(teamClueOrder)
            .set({
                hintViewed: true,
                hintViewedAt: now,
                hintViewedBy: playerId,
            })
            .where(eq(teamClueOrder.id, order.id));

        const [clue] = await db
            .select({ hintText: clues.hintText })
            .from(clues)
            .where(eq(clues.id, clue_id))
            .limit(1);

        return NextResponse.json({
            success: true,
            message: "Hint unlocked! A penalty of 5 points will apply upon checkpoint completion.",
            hint_text: clue?.hintText ?? null,
        });
    } catch (error) {
        console.error("View hint error:", error);
        return NextResponse.json({ success: false, message: "Failed to view hint" }, { status: 500 });
    }
}
