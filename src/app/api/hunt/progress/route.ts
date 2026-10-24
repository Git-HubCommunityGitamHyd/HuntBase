import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
    try {
        const session = getSession(request);
        const { searchParams } = new URL(request.url);
        const teamIdParam = searchParams.get("team_id");
        const teamId = teamIdParam || (session?.role === "player" ? session.team_id : null);

        if (!teamId) {
            return NextResponse.json(
                { success: false, message: "team_id is required" },
                { status: 400 }
            );
        }

        // If player session is present, ensure caller cannot access other teams' progress
        if (session && session.role === "player" && session.team_id && session.team_id !== teamId) {
            return NextResponse.json(
                { success: false, message: "Unauthorized access to team progress" },
                { status: 403 }
            );
        }

        const supabase = createAdminClient();

        // 1. Fetch team
        const { data: team, error: teamError } = await supabase
            .from("teams")
            .select("*")
            .eq("id", teamId)
            .single();

        if (teamError || !team) {
            return NextResponse.json(
                { success: false, message: "Team not found" },
                { status: 404 }
            );
        }

        // 2. Fetch event
        const { data: event, error: eventError } = await supabase
            .from("events")
            .select("*")
            .eq("id", team.event_id)
            .single();

        if (eventError || !event) {
            return NextResponse.json(
                { success: false, message: "Event not found" },
                { status: 404 }
            );
        }

        // 3. Count total clues for event
        const { count: totalClues } = await supabase
            .from("clues")
            .select("id", { count: "exact", head: true })
            .eq("event_id", team.event_id);

        // 4. Fetch clues (safe fields for journey recap)
        const { data: clues } = await supabase
            .from("clues")
            .select("id, step_number, clue_text, location_name")
            .eq("event_id", team.event_id)
            .order("step_number", { ascending: true });

        // 5. Fetch scans for this team
        const { data: scans, error: scansError } = await supabase
            .from("scans")
            .select("*")
            .eq("team_id", team.id)
            .order("scanned_at", { ascending: true });

        if (scansError) {
            return NextResponse.json(
                { success: false, message: "Failed to fetch scan history" },
                { status: 500 }
            );
        }

        // Map scans with their clue details
        const scansWithClues = (scans || []).map((scan) => ({
            ...scan,
            clue: (clues || []).find((c) => c.id === scan.clue_id) || null,
        }));

        return NextResponse.json({
            success: true,
            team,
            event,
            totalClues: totalClues || 0,
            scans: scansWithClues,
        });
    } catch (error) {
        console.error("Hunt progress API error:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
