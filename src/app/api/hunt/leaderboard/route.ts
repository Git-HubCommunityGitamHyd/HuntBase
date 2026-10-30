import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, teams, clues, scans } from "@/db/schema";
import { eq, count, desc } from "drizzle-orm";
import { computeLeaderboard, RawTeamProgress } from "@/lib/gameplay/leaderboard";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get("event_id");

        if (!eventId) {
            return NextResponse.json(
                { success: false, message: "event_id is required" },
                { status: 400 }
            );
        }

        // 1. Fetch event metadata
        const [event] = await db
            .select({
                id: events.id,
                name: events.name,
                isActive: events.isActive,
                huntStatus: events.huntStatus,
                huntStartedAt: events.huntStartedAt,
                huntDurationMinutes: events.huntDurationMinutes,
            })
            .from(events)
            .where(eq(events.id, eventId));

        if (!event) {
            return NextResponse.json(
                { success: false, message: "Event not found" },
                { status: 404 }
            );
        }

        // 2. Count total clues for this event (Fails explicitly if DB has error)
        const [{ totalClues }] = await db
            .select({ totalClues: count() })
            .from(clues)
            .where(eq(clues.eventId, eventId));

        // 3. Fetch competing teams
        const competingTeams = await db
            .select({
                id: teams.id,
                teamName: teams.teamName,
                score: teams.score,
                currentStep: teams.currentStep,
                isDisqualified: teams.isDisqualified,
                huntFinishedAt: teams.huntFinishedAt,
            })
            .from(teams)
            .where(eq(teams.eventId, eventId));

        // 4. Batch query latest scans to prevent N+1 query overhead
        const eventScans = await db
            .select({
                teamId: scans.teamId,
                scannedAt: scans.scannedAt,
            })
            .from(scans)
            .where(eq(scans.eventId, eventId))
            .orderBy(desc(scans.scannedAt));

        const latestScanMap = new Map<string, string>();
        for (const scan of eventScans) {
            if (!latestScanMap.has(scan.teamId)) {
                latestScanMap.set(scan.teamId, scan.scannedAt.toISOString());
            }
        }

        // 5. Build raw team records for ranking
        const rawTeams: RawTeamProgress[] = competingTeams.map((t) => ({
            id: t.id,
            team_name: t.teamName,
            score: t.score ?? 0,
            current_step: t.currentStep ?? 0,
            is_disqualified: Boolean(t.isDisqualified),
            hunt_finished_at: t.huntFinishedAt ? t.huntFinishedAt.toISOString() : null,
            last_scan_at: latestScanMap.get(t.id) || null,
        }));

        // 6. Compute sorted rankings with deterministic tie-breakers
        const leaderboard = computeLeaderboard(
            rawTeams,
            totalClues ?? 0,
            event.huntStartedAt ? event.huntStartedAt.toISOString() : null
        );

        return NextResponse.json({
            success: true,
            event: {
                id: event.id,
                name: event.name,
                is_active: event.isActive,
                hunt_status: event.huntStatus,
                hunt_started_at: event.huntStartedAt ? event.huntStartedAt.toISOString() : null,
                hunt_duration_minutes: event.huntDurationMinutes,
                total_clues: totalClues ?? 0,
            },
            leaderboard,
        });
    } catch (error) {
        console.error("Leaderboard route error:", error);
        return NextResponse.json(
            { success: false, message: "Database error while fetching leaderboard" },
            { status: 500 }
        );
    }
}
