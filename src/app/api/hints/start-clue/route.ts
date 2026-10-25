import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentPlayerSession } from "@/lib/auth/server-session";

// POST - Mark a clue as started (set clue_started_at timestamp) or get existing
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { team_id, clue_order_id } = body;

        if (!team_id || !clue_order_id) {
            return NextResponse.json(
                { success: false, message: "Team ID and Clue Order ID are required" },
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

        // Fetch the full clue order record
        const { data: existingClueOrder, error: fetchError } = await supabase
            .from("team_clue_order")
            .select("*")
            .eq("id", clue_order_id)
            .eq("team_id", team_id)
            .single();

        if (fetchError || !existingClueOrder) {
            return NextResponse.json(
                { success: false, message: "Clue order not found" },
                { status: 404 }
            );
        }

        // If already started, return the existing data
        if (existingClueOrder.clue_started_at) {
            return NextResponse.json({
                success: true,
                message: "Clue already started",
                clue_order: existingClueOrder,
            });
        }

        // Set the clue_started_at timestamp
        const now = new Date().toISOString();
        const { data: updatedClueOrder, error: updateError } = await supabase
            .from("team_clue_order")
            .update({ clue_started_at: now })
            .eq("id", clue_order_id)
            .eq("team_id", team_id)
            .select("*")
            .single();

        if (updateError) {
            return NextResponse.json(
                { success: false, message: updateError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Clue started",
            clue_order: updatedClueOrder,
        });
    } catch (error) {
        console.error("Start clue error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to start clue" },
            { status: 500 }
        );
    }
}
