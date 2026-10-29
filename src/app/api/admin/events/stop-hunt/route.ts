import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// POST - Conclude / Stop the hunt for an event
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

        // Mark hunt as completed and record end timestamp
        const { error: updateError } = await supabase
            .from("events")
            .update({
                hunt_status: "completed",
                hunt_ended_at: new Date().toISOString(),
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
            message: "Hunt concluded successfully. Scores and final leaderboard are frozen.",
        });
    } catch (error) {
        console.error("Stop hunt error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to stop hunt" },
            { status: 500 }
        );
    }
}
