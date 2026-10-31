import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events, teamClueOrder, teams } from "@/db/schema";
import { requirePlayer } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
    try {
        // High-priority Issue 3: Authenticate and derive player and team from verified session
        const auth = await requirePlayer(request);
        if (auth instanceof NextResponse) return auth;

        const body = await request.json().catch(() => ({}));
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

        // High-priority Issue 2: Reject requests when hunt is inactive, paused, or completed
        if (team.event.huntStatus === "paused") {
            return NextResponse.json(
                { success: false, message: "The hunt is currently paused by organizers. Hints are unavailable." },
                { status: 403 }
            );
        }

        if (team.event.huntStatus === "completed") {
            return NextResponse.json(
                { success: false, message: "The hunt has concluded. Hints are no longer available." },
                { status: 403 }
            );
        }

        if (!team.event.isActive || team.event.huntStatus !== "active" || !team.event.huntStartedAt) {
            return NextResponse.json(
                { success: false, message: "The hunt has not started yet. Hints are unavailable." },
                { status: 403 }
            );
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

        // Enforce anti-cheat hint delay
        const delay = team.event.hintDelayMinutes ?? 5;
        const now = Date.now();
        const startedAt = order.clueStartedAt ? order.clueStartedAt.getTime() : now;
        const elapsedMinutes = (now - startedAt) / 60000;

        if (elapsedMinutes < delay) {
            const remainingMinutes = Math.ceil(delay - elapsedMinutes);
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
                hintViewedAt: new Date(),
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
            message: "Hint unlocked! Points for this clue are reduced to +5",
            hint_text: clue?.hintText ?? null,
        });
    } catch (error) {
        console.error("View hint error:", error);
        return NextResponse.json({ success: false, message: "Failed to view hint" }, { status: 500 });
    }
}
