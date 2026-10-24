import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { shuffleArray } from "@/lib/utils/helpers";

// GET - Fetch all teams for an event
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get("event_id");

        const supabase = createAdminClient();

        let query = supabase
            .from("teams")
            .select("*")
            .eq("is_admin", false)
            .order("created_at", { ascending: true });

        if (eventId) {
            query = query.eq("event_id", eventId);
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Teams fetch error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch teams" }, { status: 500 });
    }
}

// POST - Create a new team (manual creation with just name + player limits)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { event_id, team_name, min_players = 2, max_players = 2 } = body;

        if (!event_id || !team_name) {
            return NextResponse.json(
                { success: false, message: "Event ID and team name are required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // Check if team name already exists for this event
        const { data: existing } = await supabase
            .from("teams")
            .select("id")
            .eq("event_id", event_id)
            .eq("team_name", team_name)
            .single();

        if (existing) {
            return NextResponse.json(
                { success: false, message: "A team with this name already exists for this event" },
                { status: 400 }
            );
        }

        // Create team (no username/password - players will register themselves)
        const { data, error } = await supabase
            .from("teams")
            .insert({
                event_id,
                team_name,
                min_players,
                max_players,
                username: null, // No longer needed - players have individual accounts
                password_hash: null,
                is_admin: false,
                score: 0,
                current_step: 0,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        // Generate clue order for the team if clues exist for this event
        const { data: clues } = await supabase
            .from("clues")
            .select("id")
            .eq("event_id", event_id)
            .order("step_number", { ascending: true });

        if (clues && clues.length > 0) {
            const clueIds = clues.map((c) => c.id);
            const shuffledClues = shuffleArray(clueIds);
            const clueOrders = shuffledClues.map((clueId, index) => ({
                team_id: data.id,
                clue_id: clueId,
                step_index: index,
            }));

            const { error: clueOrderError } = await supabase
                .from("team_clue_order")
                .insert(clueOrders);

            if (clueOrderError) {
                console.error("Clue order assignment error for manual team:", clueOrderError);
            }
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Team create error:", error);
        return NextResponse.json({ success: false, message: "Failed to create team" }, { status: 500 });
    }
}

// PUT - Update team (score, disqualify, etc.)
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ success: false, message: "Team ID required" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const { error } = await supabase
            .from("teams")
            .update(updates)
            .eq("id", id);

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Team update error:", error);
        return NextResponse.json({ success: false, message: "Failed to update team" }, { status: 500 });
    }
}

// DELETE - Delete a team
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ success: false, message: "Team ID required" }, { status: 400 });
        }

        const supabase = createAdminClient();

        // Delete team (cascade will handle team_members deletion)
        const { error } = await supabase
            .from("teams")
            .delete()
            .eq("id", id);

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Team delete error:", error);
        return NextResponse.json({ success: false, message: "Failed to delete team" }, { status: 500 });
    }
}
