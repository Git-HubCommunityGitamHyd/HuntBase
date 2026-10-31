import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, teams, clues, scans, eventPauses } from "@/db/schema";
import { eq, count, max } from "drizzle-orm";
import { computeLeaderboard, RawTeamProgress } from "@/lib/gameplay/leaderboard";

interface CacheEntry {
    data: unknown;
    expiresAt: number;
}

// In-memory cache with 5s TTL to absorb rapid polling surges
const leaderboardCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5000;

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

        const now = Date.now();
        const cached = leaderboardCache.get(eventId);
        if (cached && cached.expiresAt > now) {
            return NextResponse.json(cached.data, {
                headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" },
            });
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

        // 2. Count total clues for this event
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

        // 4. Fetch pause intervals to exclude paused time from completion durations
        const eventPauseRows = await db
            .select({
                pausedAt: eventPauses.pausedAt,
                resumedAt: eventPauses.resumedAt,
            })
            .from(eventPauses)
            .where(eq(eventPauses.eventId, eventId));

        // 5. Aggregate the latest scan timestamp per team in SQL using MAX() and GROUP BY
        const latestScans = await db
            .select({
                teamId: scans.teamId,
                latestScanAt: max(scans.scannedAt),
            })
            .from(scans)
            .where(eq(scans.eventId, eventId))
            .groupBy(scans.teamId);

        const latestScanMap = new Map<string, string>();
        for (const s of latestScans) {
            if (s.teamId && s.latestScanAt) {
                latestScanMap.set(s.teamId, new Date(s.latestScanAt).toISOString());
            }
        }

        // 6. Build raw team records for ranking
        const rawTeams: RawTeamProgress[] = competingTeams.map((t) => ({
            id: t.id,
            team_name: t.teamName,
            score: t.score ?? 0,
            current_step: t.currentStep ?? 0,
            is_disqualified: Boolean(t.isDisqualified),
            hunt_finished_at: t.huntFinishedAt ? t.huntFinishedAt.toISOString() : null,
            last_scan_at: latestScanMap.get(t.id) || null,
        }));

        // 7. Compute sorted rankings with deterministic tie-breakers (active elapsed time excluding pause)
        const leaderboard = computeLeaderboard(
            rawTeams,
            totalClues ?? 0,
            event.huntStartedAt ? event.huntStartedAt.toISOString() : null,
            eventPauseRows
        );

        const responsePayload = {
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
        };

        leaderboardCache.set(eventId, {
            data: responsePayload,
            expiresAt: now + CACHE_TTL_MS,
        });

        return NextResponse.json(responsePayload, {
            headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" },
        });
    } catch (error) {
        console.error("Leaderboard route error:", error);
        return NextResponse.json(
            { success: false, message: "Database error while fetching leaderboard" },
            { status: 500 }
        );
    }
}
