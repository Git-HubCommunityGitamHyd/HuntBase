import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// POST - Pause or Resume an active hunt
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { event_id, action } = body; // action can be 'pause' | 'resume' or omitted to toggle

        if (!event_id) {
            return NextResponse.json(
                { success: false, message: "Event ID is required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // 1. Fetch current hunt status
        const { data: event, error: fetchError } = await supabase
            .from("events")
            .select("id, name, hunt_status, hunt_started_at")
            .eq("id", event_id)
            .single();

        if (fetchError || !event) {
            return NextResponse.json(
                { success: false, message: "Event not found" },
                { status: 404 }
            );
        }

        if (!event.hunt_started_at) {
            return NextResponse.json(
                { success: false, message: "Cannot pause a hunt that has not been started yet" },
                { status: 400 }
            );
        }

        let newStatus: "active" | "paused";

        if (action === "pause") {
            newStatus = "paused";
        } else if (action === "resume") {
            newStatus = "active";
        } else {
            // Toggle
            newStatus = event.hunt_status === "paused" ? "active" : "paused";
        }

        const { error: updateError } = await supabase
            .from("events")
            .update({ hunt_status: newStatus })
            .eq("id", event_id);

        if (updateError) {
            return NextResponse.json(
                { success: false, message: updateError.message },
                { status: 500 }
            );
        }

        const message = newStatus === "paused" 
            ? "Hunt has been paused. Checkpoint scans and hint unlocks are temporarily suspended."
            : "Hunt has been resumed. Gameplay is active.";

        return NextResponse.json({
            success: true,
            message,
            hunt_status: newStatus,
        });
    } catch (error) {
        console.error("Pause hunt error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to update hunt state" },
            { status: 500 }
        );
    }
}
