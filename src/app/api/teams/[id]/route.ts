import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentPlayerSession } from "@/lib/auth/server-session";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { success: false, message: "Team ID is required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
        const playerSession = await getCurrentPlayerSession(_request, supabase);
        if (!playerSession) {
            return NextResponse.json({ success: false, message: "A current player session is required" }, { status: 401 });
        }
        if (id !== playerSession.team_id) {
            return NextResponse.json({ success: false, message: "This player is not a member of that team" }, { status: 403 });
        }

        const { data: team, error } = await supabase
            .from("teams")
            .select("id, event_id, team_name, score, current_step, is_disqualified, hunt_finished_at, min_players, max_players, registration_status")
            .eq("id", id)
            .single();

        if (error || !team) {
            return NextResponse.json(
                { success: false, message: "Team not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            team,
        });
    } catch (error) {
        console.error("Fetch team error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch team" },
            { status: 500 }
        );
    }
}
