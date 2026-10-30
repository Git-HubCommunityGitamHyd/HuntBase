import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teams, events, clues, teamClueOrder } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { requirePlayerSession, handleAuthError } from "@/lib/auth/guards";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));

        // 1. Session Auth: Validate player session
        let playerAuth;
        try {
            playerAuth = requirePlayerSession(request, body.team_id);
        } catch (authErr) {
            const authResponse = handleAuthError(authErr);
            if (authResponse) return authResponse;
            throw authErr;
        }

        const { teamId } = playerAuth;

        // 2. Fetch team
        const [team] = await db
            .select({
                id: teams.id,
                eventId: teams.eventId,
                currentStep: teams.currentStep,
                score: teams.score,
                isDisqualified: teams.isDisqualified,
                huntFinishedAt: teams.huntFinishedAt,
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

        // 3. Fetch event
        const [event] = await db
            .select({
                id: events.id,
                name: events.name,
                isActive: events.isActive,
                huntStatus: events.huntStatus,
                startTime: events.startTime,
                endTime: events.endTime,
                huntStartedAt: events.huntStartedAt,
                huntDurationMinutes: events.huntDurationMinutes,
                hintDelayMinutes: events.hintDelayMinutes,
            })
            .from(events)
            .where(eq(events.id, team.eventId));

        if (!event) {
            return NextResponse.json(
                { success: false, message: "Event not found" },
                { status: 404 }
            );
        }

        // 4. Count total clues
        const [{ totalClues }] = await db
            .select({ totalClues: count() })
            .from(clues)
            .where(eq(clues.eventId, team.eventId));

        const isComplete = Boolean(
            team.huntFinishedAt || (totalClues > 0 && team.currentStep >= totalClues)
        );

        if (isComplete) {
            return NextResponse.json({
                success: true,
                isComplete: true,
                totalClues: totalClues || 0,
                currentStep: team.currentStep,
                score: team.score,
                hunt_finished_at: team.huntFinishedAt,
                event,
            });
        }

        // 5. Fetch team clue assignment for current step
        let [clueAssignment] = await db
            .select()
            .from(teamClueOrder)
            .where(and(
                eq(teamClueOrder.teamId, team.id),
                eq(teamClueOrder.stepIndex, team.currentStep)
            ));

        if (!clueAssignment) {
            return NextResponse.json(
                { success: false, message: "Clue assignment not found for this step" },
                { status: 404 }
            );
        }

        // Start clue countdown timer if this is the first visit
        if (!clueAssignment.clueStartedAt) {
            const now = new Date();
            const [updated] = await db
                .update(teamClueOrder)
                .set({ clueStartedAt: now })
                .where(eq(teamClueOrder.id, clueAssignment.id))
                .returning();

            if (updated) {
                clueAssignment = updated;
            }
        }

        // 6. Fetch clue details
        const [clue] = await db
            .select({
                id: clues.id,
                stepNumber: clues.stepNumber,
                clueText: clues.clueText,
                hintText: clues.hintText,
            })
            .from(clues)
            .where(eq(clues.id, clueAssignment.clueId));

        if (!clue) {
            return NextResponse.json(
                { success: false, message: "Clue content not found" },
                { status: 404 }
            );
        }

        // 7. Calculate hint countdown
        const hintDelayMinutes = event.hintDelayMinutes ?? 5;
        const hintDelayMs = hintDelayMinutes * 60 * 1000;
        const clueStartTime = clueAssignment.clueStartedAt
            ? new Date(clueAssignment.clueStartedAt).getTime()
            : Date.now();
        const timePassedMs = Date.now() - clueStartTime;
        const secondsUntilHintAvailable = Math.max(0, Math.ceil((hintDelayMs - timePassedMs) / 1000));
        const hintAvailable = secondsUntilHintAvailable === 0;

        // 8. Sanitize clue: strip locationName & adminNotes, hide hintText unless unlocked
        const sanitizedClue = {
            id: clue.id,
            step_number: clue.stepNumber,
            clue_text: clue.clueText,
            has_hint: Boolean(clue.hintText),
            hint_text: clueAssignment.hintViewed ? clue.hintText : null,
        };

        return NextResponse.json({
            success: true,
            isComplete: false,
            clue: sanitizedClue,
            clueOrder: {
                id: clueAssignment.id,
                step_index: clueAssignment.stepIndex,
                clue_started_at: clueAssignment.clueStartedAt,
                hint_viewed: clueAssignment.hintViewed,
                hint_viewed_at: clueAssignment.hintViewedAt,
                hint_available: hintAvailable,
                seconds_until_hint_available: secondsUntilHintAvailable,
            },
            totalClues: totalClues || 0,
            currentStep: team.currentStep,
            score: team.score,
            event,
        });
    } catch (error) {
        console.error("current-clue route error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch current clue" },
            { status: 500 }
        );
    }
}
