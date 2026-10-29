import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
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

        const supabase = createAdminClient();

        // 1. Fetch event metadata
        const { data: event, error: eventError } = await supabase
            .from("events")
            .select("id, name, is_active, hunt_status, hunt_started_at, hunt_duration_minutes")
            .eq("id", eventId)
            .single();

        if (eventError || !event) {
            return NextResponse.json(
                { success: false, message: "Event not found" },
                { status: 404 }
            );
        }

        // 2. Count total clues for this event
        const { count: totalClues, error: clueCountError } = await supabase
            .from("clues")
            .select("id", { count: "exact", head: true })
            .eq("event_id", eventId);

        if (clueCountError) {
            console.error("Leaderboard clue count error:", clueCountError);
        }

        // 3. Fetch competing teams (excluding admins)
        const { data: teams, error: teamsError } = await supabase
            .from("teams")
            .select("id, team_name, score, current_step, is_disqualified, hunt_finished_at, is_admin")
            .eq("event_id", eventId)
            .eq("is_admin", false);

        if (teamsError) {
            console.error("Leaderboard teams error:", teamsError);
            return NextResponse.json(
                { success: false, message: "Failed to fetch leaderboard teams" },
                { status: 500 }
            );
        }

        // 4. Batch query latest scans to prevent N+1 query overhead
        const { data: scans } = await supabase
            .from("scans")
            .select("team_id, scanned_at")
            .eq("event_id", eventId)
            .order("scanned_at", { ascending: false });

        const latestScanMap = new Map<string, string>();
        if (scans) {
            for (const scan of scans) {
                if (!latestScanMap.has(scan.team_id)) {
                    latestScanMap.set(scan.team_id, scan.scanned_at);
                }
            }
        }

        // 5. Build raw team records for ranking
        const rawTeams: RawTeamProgress[] = (teams || []).map((t) => ({
            id: t.id,
            team_name: t.team_name,
            score: t.score ?? 0,
            current_step: t.current_step ?? 0,
            is_disqualified: Boolean(t.is_disqualified),
            hunt_finished_at: t.hunt_finished_at || null,
            last_scan_at: latestScanMap.get(t.id) || null,
        }));

        // 6. Compute sorted rankings with deterministic tie-breakers
        const leaderboard = computeLeaderboard(
            rawTeams,
            totalClues || 0,
            event.hunt_started_at
        );

        return NextResponse.json({
            success: true,
            event: {
                id: event.id,
                name: event.name,
                is_active: event.is_active,
                hunt_status: event.hunt_status,
                hunt_started_at: event.hunt_started_at,
                hunt_duration_minutes: event.hunt_duration_minutes,
                total_clues: totalClues || 0,
            },
            leaderboard,
        });
    } catch (error) {
        console.error("Leaderboard route error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to load leaderboard" },
            { status: 500 }
        );
    }
}
