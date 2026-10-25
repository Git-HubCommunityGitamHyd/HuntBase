import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getActiveAdminSession, getAdminOwnedEvent } from "@/lib/auth/server-session";

// POST - Stop the hunt for an event
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
        const event = await getAdminOwnedEvent(admin, event_id, supabase);
        if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

        // Clear hunt_started_at to stop the hunt
        let eventUpdate = supabase
            .from("events")
            .update({ hunt_started_at: null })
            .eq("id", event_id);
        eventUpdate = event.organization_id
            ? eventUpdate.eq("organization_id", event.organization_id)
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
            message: "Hunt stopped successfully!",
        });
    } catch (error) {
        console.error("Stop hunt error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to stop hunt" },
            { status: 500 }
        );
    }
}
