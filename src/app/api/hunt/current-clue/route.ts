import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
    try {
        const { team_id } = await request.json();

        if (!team_id) {
            return NextResponse.json(
                { success: false, message: "team_id is required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // 1. Fetch team
        const { data: team, error: teamError } = await supabase
            .from("teams")
            .select("id, event_id, current_step, score, is_disqualified, hunt_finished_at")
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
                { success: false, message: "Your team has been disqualified" },
                { status: 403 }
            );
        }

        // 2. Fetch event details
        const { data: event, error: eventError } = await supabase
            .from("events")
            .select("id, name, is_active, hunt_status, start_time, end_time, hunt_started_at, hunt_duration_minutes, hint_delay_minutes")
            .eq("id", team.event_id)
            .single();

        if (eventError || !event) {
            return NextResponse.json(
                { success: false, message: "Event not found" },
                { status: 404 }
            );
        }

        // 3. Count total clues
        const { count: totalClues } = await supabase
            .from("clues")
            .select("id", { count: "exact", head: true })
            .eq("event_id", team.event_id);

        const isComplete = Boolean(
            team.hunt_finished_at || (totalClues !== null && team.current_step >= totalClues)
        );

        if (isComplete) {
            return NextResponse.json({
                success: true,
                isComplete: true,
                totalClues: totalClues || 0,
                currentStep: team.current_step,
                score: team.score,
                hunt_finished_at: team.hunt_finished_at,
                event,
            });
        }

        // 4. Fetch the team's clue assignment for this step
        let { data: clueOrder } = await supabase
            .from("team_clue_order")
            .select("*")
            .eq("team_id", team.id)
            .eq("step_index", team.current_step)
            .single();

        if (!clueOrder) {
            return NextResponse.json(
                { success: false, message: "Clue assignment not found for this step" },
                { status: 404 }
            );
        }

        // Ensure clue_started_at is initialized when the team first visits the clue
        if (!clueOrder.clue_started_at) {
            const now = new Date().toISOString();
            const { data: updatedOrder } = await supabase
                .from("team_clue_order")
                .update({ clue_started_at: now })
                .eq("id", clueOrder.id)
                .select("*")
                .single();

            if (updatedOrder) {
                clueOrder = updatedOrder;
            }
        }

        // 5. Fetch clue securely using admin client
        const { data: clue, error: clueError } = await supabase
            .from("clues")
            .select("id, step_number, clue_text, hint_text")
            .eq("id", clueOrder.clue_id)
            .single();

        if (clueError || !clue) {
            return NextResponse.json(
                { success: false, message: "Clue content not found" },
                { status: 404 }
            );
        }

        // 6. Calculate hint availability countdown
        const hintDelayMinutes = event.hint_delay_minutes ?? 5;
        const hintDelayMs = hintDelayMinutes * 60 * 1000;
        const clueStartTime = clueOrder.clue_started_at ? new Date(clueOrder.clue_started_at).getTime() : Date.now();
        const timePassedMs = Date.now() - clueStartTime;
        const secondsUntilHintAvailable = Math.max(0, Math.ceil((hintDelayMs - timePassedMs) / 1000));
        const hintAvailable = secondsUntilHintAvailable === 0;

        // 7. Security sanitization:
        // Do NOT return hint_text unless hint_viewed is true!
        // Do NOT return admin_notes or location_name!
        const sanitizedClue = {
            id: clue.id,
            step_number: clue.step_number,
            clue_text: clue.clue_text,
            has_hint: Boolean(clue.hint_text),
            hint_text: clueOrder.hint_viewed ? clue.hint_text : null,
        };

        return NextResponse.json({
            success: true,
            isComplete: false,
            clue: sanitizedClue,
            clueOrder: {
                id: clueOrder.id,
                step_index: clueOrder.step_index,
                clue_started_at: clueOrder.clue_started_at,
                hint_viewed: clueOrder.hint_viewed,
                hint_viewed_at: clueOrder.hint_viewed_at,
                hint_available: hintAvailable,
                seconds_until_hint_available: secondsUntilHintAvailable,
            },
            totalClues: totalClues || 0,
            currentStep: team.current_step,
            score: team.score,
            event,
        });
    } catch (error) {
        console.error("current-clue endpoint error:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
