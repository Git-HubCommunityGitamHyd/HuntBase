import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getActiveAdminSession, getAdminOwnedClue, getAdminOwnedEvent } from "@/lib/auth/server-session";
import { sanitizeClueUpdates } from "@/lib/auth/admin-policy";

async function getOwnedEventHuntState(
    admin: Awaited<ReturnType<typeof getActiveAdminSession>>,
    eventId: string,
    supabase: ReturnType<typeof createAdminClient>
): Promise<{ active: boolean } | null> {
    if (!admin) return null;
    const ownedEvent = await getAdminOwnedEvent(admin, eventId, supabase);
    if (!ownedEvent) return null;

    let query = supabase.from("events").select("id, hunt_started_at").eq("id", eventId);
    query = ownedEvent.organization_id
        ? query.eq("organization_id", ownedEvent.organization_id)
        : query.is("organization_id", null);
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return { active: data.hunt_started_at !== null };
}

// GET - Fetch all clues for an event
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get("event_id");
        if (!eventId) {
            return NextResponse.json({ success: false, message: "Event ID is required" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        if (!(await getAdminOwnedEvent(admin, eventId, supabase))) {
            return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
        }

        const { data, error } = await supabase
            .from("clues")
            .select("*")
            .eq("event_id", eventId)
            .order("step_number", { ascending: true });

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Clues fetch error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch clues" }, { status: 500 });
    }
}

// POST - Create new clue
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { event_id, step_number, clue_text, location_name, hint_text, admin_notes } = body;

        if (!event_id || !clue_text) {
            return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const huntState = await getOwnedEventHuntState(admin, event_id, supabase);
        if (!huntState) {
            return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
        }
        if (huntState.active) {
            return NextResponse.json({ success: false, message: "Clues cannot be added during an active hunt" }, { status: 409 });
        }

        // Direct insert - simpler and doesn't require RPC functions
        const { data, error } = await supabase
            .from("clues")
            .insert({
                event_id,
                step_number,
                clue_text,
                location_name: location_name || null,
                hint_text: hint_text || null,
                admin_notes: admin_notes || null,
            })
            .select()
            .single();

        if (error) {
            console.error("Clue insert error:", error);
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Clue creation error:", error);
        return NextResponse.json({ success: false, message: "Failed to create clue" }, { status: 500 });
    }
}

// PUT - Update clue
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ success: false, message: "Clue ID required" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const clue = await getAdminOwnedClue(admin, id, supabase);
        if (!clue) return NextResponse.json({ success: false, message: "Clue not found" }, { status: 404 });
        const updates = sanitizeClueUpdates(body);
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ success: false, message: "No supported clue fields supplied" }, { status: 400 });
        }
        const huntState = await getOwnedEventHuntState(admin, clue.event_id, supabase);
        if (!huntState) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
        if (huntState.active && Object.hasOwn(updates, "step_number")) {
            return NextResponse.json({ success: false, message: "Clue order cannot be changed during an active hunt" }, { status: 409 });
        }
        const { error } = await supabase
            .from("clues")
            .update(updates)
            .eq("id", id)
            .eq("event_id", clue.event_id);

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Clue update error:", error);
        return NextResponse.json({ success: false, message: "Failed to update clue" }, { status: 500 });
    }
}

// DELETE - Delete clue
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ success: false, message: "Clue ID required" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const clue = await getAdminOwnedClue(admin, id, supabase);
        if (!clue) return NextResponse.json({ success: false, message: "Clue not found" }, { status: 404 });
        const huntState = await getOwnedEventHuntState(admin, clue.event_id, supabase);
        if (!huntState) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
        if (huntState.active) {
            return NextResponse.json({ success: false, message: "Clues cannot be deleted during an active hunt" }, { status: 409 });
        }
        const { error } = await supabase
            .from("clues")
            .delete()
            .eq("id", id)
            .eq("event_id", clue.event_id);

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Clue delete error:", error);
        return NextResponse.json({ success: false, message: "Failed to delete clue" }, { status: 500 });
    }
}
