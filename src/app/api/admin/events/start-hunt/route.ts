import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateRoundRobinClueOrders } from "@/lib/gameplay/clue-order";

// POST - Start the hunt for an event
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { event_id } = body;

        if (!event_id) {
            return NextResponse.json(
                { success: false, message: "Event ID is required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // 1. Get the event
        const { data: event, error: eventError } = await supabase
            .from("events")
            .select("id, name, is_active, hunt_status")
            .eq("id", event_id)
            .single();

        if (eventError || !event) {
            return NextResponse.json(
                { success: false, message: "Event not found" },
                { status: 404 }
            );
        }

        if (!event.is_active) {
            return NextResponse.json(
                { success: false, message: "Event must be activated before starting the hunt" },
                { status: 400 }
            );
        }

        // 2. Get all non-admin teams for this event
        const { data: teams, error: teamsError } = await supabase
            .from("teams")
            .select("id, team_name")
            .eq("event_id", event_id)
            .eq("is_admin", false)
            .order("created_at", { ascending: true });

        if (teamsError) {
            return NextResponse.json(
                { success: false, message: teamsError.message },
                { status: 500 }
            );
        }

        // 3. Get all clues for this event
        const { data: clues, error: cluesError } = await supabase
            .from("clues")
            .select("id")
            .eq("event_id", event_id)
            .order("step_number", { ascending: true });

        if (cluesError) {
            return NextResponse.json(
                { success: false, message: cluesError.message },
                { status: 500 }
            );
        }

        if (!clues || clues.length === 0) {
            return NextResponse.json(
                { success: false, message: "No clues found for this event. Please add clues first!" },
                { status: 400 }
            );
        }

        // 4. Initialize / Reset teams and clue ordering (in case of restart)
        if (teams && teams.length > 0) {
            const teamIds = teams.map((t) => t.id);
            const clueIds = clues.map((c) => c.id);

            // Clean up previous clue orders and scans for these teams
            await supabase
                .from("team_clue_order")
                .delete()
                .in("team_id", teamIds);

            await supabase
                .from("scans")
                .delete()
                .in("team_id", teamIds);

            await supabase
                .from("fake_qr_scans")
                .delete()
                .in("team_id", teamIds);

            // Generate deterministic round-robin clue sequence with randomized middle routes
            const clueOrders = generateRoundRobinClueOrders(teamIds, clueIds);

            if (clueOrders.length > 0) {
                const { error: insertError } = await supabase
                    .from("team_clue_order")
                    .insert(clueOrders);

                if (insertError) {
                    console.error("Failed to insert team clue orders:", insertError);
                    return NextResponse.json(
                        { success: false, message: "Failed to generate clue orders: " + insertError.message },
                        { status: 500 }
                    );
                }
            }

            // Reset all teams to score 0 and step 0
            await supabase
                .from("teams")
                .update({ current_step: 0, score: 0, hunt_finished_at: null })
                .in("id", teamIds);
        }

        // 5. Update event status to active and stamp start time
        const { error: updateError } = await supabase
            .from("events")
            .update({
                hunt_status: "active",
                hunt_started_at: new Date().toISOString(),
                hunt_ended_at: null,
            })
            .eq("id", event_id);

        if (updateError) {
            return NextResponse.json(
                { success: false, message: updateError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Hunt started! ${teams?.length || 0} teams are deployed across ${clues.length} clue checkpoints.`,
            teamsCount: teams?.length || 0,
            cluesCount: clues.length,
        });
    } catch (error) {
        console.error("Start hunt error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to start hunt" },
            { status: 500 }
        );
    }
}
