import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentPlayerSession } from "@/lib/auth/server-session";

// POST - Mark a hint as viewed for a team's current clue
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { team_id, clue_id } = body;

        if (!team_id || !clue_id) {
            return NextResponse.json(
                { success: false, message: "Team ID and Clue ID are required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
        const playerSession = await getCurrentPlayerSession(request, supabase);
        if (!playerSession) {
            return NextResponse.json({ success: false, message: "A current player session is required" }, { status: 401 });
        }
        if (team_id !== playerSession.team_id) {
            return NextResponse.json({ success: false, message: "This player is not a member of that team" }, { status: 403 });
        }

        // Verify team exists and is not disqualified
        const { data: team, error: teamError } = await supabase
            .from("teams")
            .select("*, events(*)")
            .eq("id", team_id)
            .single();

        if (teamError || !team) {
            return NextResponse.json(
                { success: false, message: "Team not found" },
                { status: 404 }
            );
        }

        if (team.is_disqualified) {
            return NextResponse.json(
                { success: false, message: "Team is disqualified" },
                { status: 403 }
            );
        }

        // Check if hunt is active
        if (!team.events?.hunt_started_at) {
            return NextResponse.json(
                { success: false, message: "Hunt has not started" },
                { status: 403 }
            );
        }

        // Get the team_clue_order record
        const { data: clueOrder, error: clueOrderError } = await supabase
            .from("team_clue_order")
            .select("*")
            .eq("team_id", team_id)
            .eq("clue_id", clue_id)
            .single();

        if (clueOrderError || !clueOrder) {
            return NextResponse.json(
                { success: false, message: "Clue order not found" },
                { status: 404 }
            );
        }

        // Check if hint was already viewed
        if (clueOrder.hint_viewed) {
            return NextResponse.json({
                success: true,
                message: "Hint already viewed",
                already_viewed: true,
            });
        }

        // Check if enough time has passed (hint_delay_minutes)
        const hintDelayMinutes = team.events?.hint_delay_minutes || 5;
        const clueStartedAt = clueOrder.clue_started_at ? new Date(clueOrder.clue_started_at) : null;
        
        if (clueStartedAt) {
            const timePassed = (Date.now() - clueStartedAt.getTime()) / 1000 / 60; // in minutes
            if (timePassed < hintDelayMinutes) {
                return NextResponse.json(
                    { success: false, message: `Hint not available yet. Wait ${Math.ceil(hintDelayMinutes - timePassed)} more minutes.` },
                    { status: 400 }
                );
            }
        }

        // Mark hint as viewed
        const { error: updateError } = await supabase
            .from("team_clue_order")
            .update({
                hint_viewed: true,
                hint_viewed_at: new Date().toISOString(),
                hint_viewed_by: playerSession.id,
            })
            .eq("id", clueOrder.id);

        if (updateError) {
            return NextResponse.json(
                { success: false, message: updateError.message },
                { status: 500 }
            );
        }

        // Get the hint text
        const { data: clue } = await supabase
            .from("clues")
            .select("hint_text")
            .eq("id", clue_id)
            .single();

        return NextResponse.json({
            success: true,
            message: "Hint viewed! Points for this clue reduced to +5",
            hint_text: clue?.hint_text || null,
        });
    } catch (error) {
        console.error("View hint error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to view hint" },
            { status: 500 }
        );
    }
}
