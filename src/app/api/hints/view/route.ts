import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teams, events, clues, teamClueOrder } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requirePlayerSession, handleAuthError } from "@/lib/auth/guards";

// POST - Mark a hint as viewed for a team's current clue
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const { clue_id } = body;

        if (!clue_id) {
            return NextResponse.json(
                { success: false, message: "clue_id is required" },
                { status: 400 }
            );
        }

        // 1. Session Auth: Verify caller is an active player belonging to this team
        let playerAuth;
        try {
            playerAuth = requirePlayerSession(request, body.team_id);
        } catch (authErr) {
            const authResponse = handleAuthError(authErr);
            if (authResponse) return authResponse;
            throw authErr;
        }

        const { playerId, teamId } = playerAuth;

        // 2. Fetch team
        const [team] = await db
            .select({
                id: teams.id,
                eventId: teams.eventId,
                isDisqualified: teams.isDisqualified,
                huntFinishedAt: teams.huntFinishedAt,
                currentStep: teams.currentStep,
            })
            .from(teams)
            .where(eq(teams.id, teamId));

        if (!team) {
            return NextResponse.json(
                { success: false, message: "Team not found" },
                { status: 404 }
            );
        }

        if (team.isDisqualified) {
            return NextResponse.json(
                { success: false, message: "Your team has been disqualified" },
                { status: 403 }
            );
        }

        if (team.huntFinishedAt) {
            return NextResponse.json(
                { success: false, message: "Your team has already completed the hunt" },
                { status: 400 }
            );
        }

        // 3. Fetch event
        const [event] = await db
            .select({
                id: events.id,
                isActive: events.isActive,
                huntStatus: events.huntStatus,
                huntStartedAt: events.huntStartedAt,
                huntDurationMinutes: events.huntDurationMinutes,
                hintDelayMinutes: events.hintDelayMinutes,
            })
            .from(events)
            .where(eq(events.id, team.eventId));

        if (!event || !event.isActive || !event.huntStartedAt) {
            return NextResponse.json(
                { success: false, message: "The hunt has not started yet" },
                { status: 403 }
            );
        }

        if (event.huntStatus === "paused") {
            return NextResponse.json(
                { success: false, message: "The hunt is currently paused by organizers" },
                { status: 403 }
            );
        }

        // Global timer check
        const huntStartTime = new Date(event.huntStartedAt).getTime();
        const huntDurationMs = (event.huntDurationMinutes || 60) * 60 * 1000;
        if (Date.now() > huntStartTime + huntDurationMs) {
            return NextResponse.json(
                { success: false, message: "Time's up! The hunt has concluded." },
                { status: 403 }
            );
        }

        // 4. Fetch clue order record
        const [clueOrder] = await db
            .select()
            .from(teamClueOrder)
            .where(and(
                eq(teamClueOrder.teamId, team.id),
                eq(teamClueOrder.clueId, clue_id)
            ));

        if (!clueOrder) {
            return NextResponse.json(
                { success: false, message: "Clue assignment not found for this team" },
                { status: 404 }
            );
        }

        if (clueOrder.stepIndex !== team.currentStep) {
            return NextResponse.json(
                { success: false, message: "You can only view hints for your team's active clue." },
                { status: 400 }
            );
        }

        // Already unlocked check
        if (clueOrder.hintViewed) {
            const [clue] = await db
                .select({ hintText: clues.hintText })
                .from(clues)
                .where(eq(clues.id, clue_id));

            return NextResponse.json({
                success: true,
                message: "Hint already unlocked",
                already_viewed: true,
                hint_text: clue?.hintText || null,
            });
        }

        // 5. Anti-cheat countdown validation
        const hintDelayMinutes = event.hintDelayMinutes ?? 5;
        const hintDelayMs = hintDelayMinutes * 60 * 1000;

        if (!clueOrder.clueStartedAt) {
            const now = new Date();
            await db
                .update(teamClueOrder)
                .set({ clueStartedAt: now })
                .where(eq(teamClueOrder.id, clueOrder.id));

            return NextResponse.json(
                {
                    success: false,
                    message: `Hint timer started. You must wait ${hintDelayMinutes} minute${hintDelayMinutes === 1 ? "" : "s"} before unlocking the hint.`,
                    remaining_seconds: hintDelayMinutes * 60,
                },
                { status: 400 }
            );
        }

        const clueStartTime = new Date(clueOrder.clueStartedAt).getTime();
        const timePassedMs = Date.now() - clueStartTime;

        if (timePassedMs < hintDelayMs) {
            const remainingSeconds = Math.ceil((hintDelayMs - timePassedMs) / 1000);
            const remainingMinutes = Math.ceil(remainingSeconds / 60);

            return NextResponse.json(
                {
                    success: false,
                    message: `Hint not available yet. Wait ${remainingMinutes} more minute${remainingMinutes === 1 ? "" : "s"}.`,
                    remaining_seconds: remainingSeconds,
                },
                { status: 400 }
            );
        }

        // 6. Record hint view
        const now = new Date();
        await db
            .update(teamClueOrder)
            .set({
                hintViewed: true,
                hintViewedAt: now,
                hintViewedBy: playerId,
            })
            .where(eq(teamClueOrder.id, clueOrder.id));

        // 7. Return hint text
        const [clue] = await db
            .select({ hintText: clues.hintText })
            .from(clues)
            .where(eq(clues.id, clue_id));

        return NextResponse.json({
            success: true,
            message: "Hint unlocked! Points for this clue are reduced to +5.",
            hint_text: clue?.hintText || null,
            already_viewed: false,
        });
    } catch (error) {
        console.error("View hint error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to unlock hint" },
            { status: 500 }
        );
    }
}
