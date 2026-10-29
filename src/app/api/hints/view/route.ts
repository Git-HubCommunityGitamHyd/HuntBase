import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// POST - Mark a hint as viewed for a team's current clue
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { team_id, clue_id, player_id } = body;

        if (!team_id || !clue_id) {
            return NextResponse.json(
                { success: false, message: "Team ID and Clue ID are required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // 1. Verify team exists and is eligible
        const { data: team, error: teamError } = await supabase
            .from("teams")
            .select("id, event_id, is_disqualified, hunt_finished_at, current_step")
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
                { success: false, message: "Team has been disqualified" },
                { status: 403 }
            );
        }

        if (team.hunt_finished_at) {
            return NextResponse.json(
                { success: false, message: "Team has already completed the hunt" },
                { status: 400 }
            );
        }

        // 2. Fetch event timing and lifecycle status
        const { data: event, error: eventError } = await supabase
            .from("events")
            .select("id, is_active, hunt_status, hunt_started_at, hunt_duration_minutes, hint_delay_minutes")
            .eq("id", team.event_id)
            .single();

        if (eventError || !event) {
            return NextResponse.json(
                { success: false, message: "Associated event not found" },
                { status: 404 }
            );
        }

        if (!event.is_active || !event.hunt_started_at) {
            return NextResponse.json(
                { success: false, message: "The hunt has not started yet" },
                { status: 403 }
            );
        }

        if (event.hunt_status === "paused") {
            return NextResponse.json(
                { success: false, message: "The hunt is currently paused by organizers" },
                { status: 403 }
            );
        }

        // Check if global hunt timer expired
        const huntStartTime = new Date(event.hunt_started_at).getTime();
        const huntDurationMs = (event.hunt_duration_minutes || 60) * 60 * 1000;
        if (Date.now() > huntStartTime + huntDurationMs) {
            return NextResponse.json(
                { success: false, message: "Time's up! The hunt has concluded." },
                { status: 403 }
            );
        }

        // 3. Get the team_clue_order record
        const { data: clueOrder, error: clueOrderError } = await supabase
            .from("team_clue_order")
            .select("id, step_index, clue_started_at, hint_viewed, hint_viewed_at")
            .eq("team_id", team_id)
            .eq("clue_id", clue_id)
            .single();

        if (clueOrderError || !clueOrder) {
            return NextResponse.json(
                { success: false, message: "Clue assignment not found for this team" },
                { status: 404 }
            );
        }

        // Verify this is their current step (cannot preview hints for future clues)
        if (clueOrder.step_index !== team.current_step) {
            return NextResponse.json(
                { success: false, message: "You can only view hints for your team's active clue." },
                { status: 400 }
            );
        }

        // Check if hint was already viewed
        if (clueOrder.hint_viewed) {
            const { data: clue } = await supabase
                .from("clues")
                .select("hint_text")
                .eq("id", clue_id)
                .single();

            return NextResponse.json({
                success: true,
                message: "Hint already unlocked",
                already_viewed: true,
                hint_text: clue?.hint_text || null,
            });
        }

        // 4. Strict anti-cheat countdown enforcement
        const hintDelayMinutes = event.hint_delay_minutes ?? 5;
        const hintDelayMs = hintDelayMinutes * 60 * 1000;

        // If clue_started_at was never set, initialize it now to start the countdown
        if (!clueOrder.clue_started_at) {
            const now = new Date().toISOString();
            await supabase
                .from("team_clue_order")
                .update({ clue_started_at: now })
                .eq("id", clueOrder.id);

            return NextResponse.json(
                {
                    success: false,
                    message: `Hint timer started. You must wait ${hintDelayMinutes} minute${hintDelayMinutes === 1 ? "" : "s"} before unlocking the hint.`,
                    remaining_seconds: hintDelayMinutes * 60,
                },
                { status: 400 }
            );
        }

        const clueStartTime = new Date(clueOrder.clue_started_at).getTime();
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

        // 5. Mark hint as viewed (records penalty timestamp & player)
        const { error: updateError } = await supabase
            .from("team_clue_order")
            .update({
                hint_viewed: true,
                hint_viewed_at: new Date().toISOString(),
                hint_viewed_by: player_id || null,
            })
            .eq("id", clueOrder.id);

        if (updateError) {
            return NextResponse.json(
                { success: false, message: updateError.message },
                { status: 500 }
            );
        }

        // 6. Fetch sanitized hint text
        const { data: clue } = await supabase
            .from("clues")
            .select("hint_text")
            .eq("id", clue_id)
            .single();

        return NextResponse.json({
            success: true,
            message: "Hint unlocked! Points for this clue are reduced to +5.",
            hint_text: clue?.hint_text || null,
            already_viewed: false,
        });
    } catch (error) {
        console.error("View hint error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to view hint" },
            { status: 500 }
        );
    }
}
