import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getActiveAdminSession, getAdminOwnedEvent } from "@/lib/auth/server-session";

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// POST - Start the hunt for an event
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { event_id } = body;

        if (typeof event_id !== "string" || !event_id) {
            return NextResponse.json(
                { success: false, message: "Event ID is required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const authorizedEvent = await getAdminOwnedEvent(admin, event_id, supabase);
        if (!authorizedEvent) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

        // Get the event
        let eventQuery = supabase
            .from("events")
            .select("*")
            .eq("id", event_id);
        eventQuery = authorizedEvent.organization_id
            ? eventQuery.eq("organization_id", authorizedEvent.organization_id)
            : eventQuery.is("organization_id", null);
        const { data: event, error: eventError } = await eventQuery.maybeSingle();

        if (eventError || !event) {
            return NextResponse.json(
                { success: false, message: "Event not found" },
                { status: 404 }
            );
        }

        if (!event.is_active) {
            return NextResponse.json(
                { success: false, message: "Event must be active to start the hunt" },
                { status: 400 }
            );
        }

        // Get all teams for this event (non-admin only), ordered for consistent round-robin
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

        // Get all clues for this event
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
                { success: false, message: "No clues found for this event. Add clues first!" },
                { status: 400 }
            );
        }

        // Clear any existing team_clue_order for these teams (in case of restart)
        if (teams && teams.length > 0) {
            const teamIds = teams.map(t => t.id);
            const { error: deleteError } = await supabase
                .from("team_clue_order")
                .delete()
                .in("team_id", teamIds);
            if (deleteError) {
                return NextResponse.json({ success: false, message: "Failed to clear existing clue assignments" }, { status: 500 });
            }

            // Generate clue order with ROUND-ROBIN starting points
            // Each team starts with a different clue to prevent crowding
            const clueOrders: { team_id: string; clue_id: string; step_index: number }[] = [];

            console.log(`Generating clue order for ${teams.length} teams with ${clues.length} clues`);

            for (let teamIndex = 0; teamIndex < teams.length; teamIndex++) {
                const team = teams[teamIndex];

                // Calculate starting offset for this team (round-robin)
                const startOffset = teamIndex % clues.length;

                console.log(`Team ${teamIndex + 1} "${team.team_name}": starting with clue offset ${startOffset}`);

                // Create rotated clue order: start from different clue, then random
                const rotatedClues = [
                    ...clues.slice(startOffset),
                    ...clues.slice(0, startOffset)
                ];

                // Shuffle everything EXCEPT the first clue (keep round-robin first clue)
                const firstClue = rotatedClues[0];
                const remainingClues = shuffleArray(rotatedClues.slice(1));
                const finalOrder = [firstClue, ...remainingClues];

                console.log(`  First clue ID: ${firstClue.id}`);

                finalOrder.forEach((clue, index) => {
                    clueOrders.push({
                        team_id: team.id,
                        clue_id: clue.id,
                        step_index: index,
                    });
                });
            }

            // Insert all clue orders
            if (clueOrders.length > 0) {
                const { error: insertError } = await supabase
                    .from("team_clue_order")
                    .insert(clueOrders);

                if (insertError) {
                    console.error("Failed to create team clue orders:", insertError);
                    return NextResponse.json(
                        { success: false, message: "Failed to generate clue orders: " + insertError.message },
                        { status: 500 }
                    );
                }
            }

            // Reset all teams to step 0 and score 0
            const { error: resetError } = await supabase
                .from("teams")
                .update({ current_step: 0, score: 0, hunt_finished_at: null })
                .in("id", teamIds)
                .eq("event_id", event_id);
            if (resetError) {
                return NextResponse.json({ success: false, message: "Failed to reset teams for the hunt" }, { status: 500 });
            }
        }

        // Set hunt_started_at to now
        let eventUpdate = supabase
            .from("events")
            .update({ hunt_started_at: new Date().toISOString() })
            .eq("id", event_id);
        eventUpdate = authorizedEvent.organization_id
            ? eventUpdate.eq("organization_id", authorizedEvent.organization_id)
            : eventUpdate.is("organization_id", null);
        const { error: updateError } = await eventUpdate;

        if (updateError) {
            return NextResponse.json(
                { success: false, message: updateError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Hunt started! ${teams?.length || 0} teams are ready with ${clues.length} clues each.`,
        });
    } catch (error) {
        console.error("Start hunt error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to start hunt" },
            { status: 500 }
        );
    }
}
