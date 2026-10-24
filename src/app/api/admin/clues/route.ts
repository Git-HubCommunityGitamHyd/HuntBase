import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

// GET - Fetch all clues for an event
export async function GET(request: NextRequest) {
    try {
        const session = getSession(request);
        if (!session) {
            return NextResponse.json(
                { success: false, message: "Unauthorized: Session required" },
                { status: 401 }
            );
        }

        if (session.role === "player") {
            return NextResponse.json(
                { success: false, message: "Forbidden: Admin access required" },
                { status: 403 }
            );
        }

        if (session.role !== "super_admin" && session.role !== "club_admin") {
            return NextResponse.json(
                { success: false, message: "Forbidden: Admin access required" },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get("event_id");

        const supabase = createAdminClient();

        if (session.role === "club_admin") {
            if (!session.organization_id) {
                return NextResponse.json(
                    { success: false, message: "Forbidden: No organization assigned" },
                    { status: 403 }
                );
            }

            if (eventId) {
                // Verify event belongs to club_admin's organization
                const { data: event, error: eventError } = await supabase
                    .from("events")
                    .select("id, organization_id")
                    .eq("id", eventId)
                    .maybeSingle();

                if (eventError || !event) {
                    return NextResponse.json(
                        { success: false, message: "Event not found" },
                        { status: 404 }
                    );
                }

                if (event.organization_id !== session.organization_id) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Access denied to other club's clues" },
                        { status: 403 }
                    );
                }
            } else {
                // If no eventId specified, scope clues to events in caller's organization
                const { data: orgEvents } = await supabase
                    .from("events")
                    .select("id")
                    .eq("organization_id", session.organization_id);

                const orgEventIds = (orgEvents || []).map((e) => e.id);
                if (orgEventIds.length === 0) {
                    return NextResponse.json({ success: true, data: [] });
                }

                const { data, error } = await supabase
                    .from("clues")
                    .select("*")
                    .in("event_id", orgEventIds)
                    .order("step_number", { ascending: true });

                if (error) {
                    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, data });
            }
        }

        let query = supabase.from("clues").select("*").order("step_number", { ascending: true });

        if (eventId) {
            query = query.eq("event_id", eventId);
        }

        const { data, error } = await query;

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
        const session = getSession(request);
        if (!session) {
            return NextResponse.json({ success: false, message: "Unauthorized: Session required" }, { status: 401 });
        }
        if (session.role === "player" || (session.role !== "super_admin" && session.role !== "club_admin")) {
            return NextResponse.json({ success: false, message: "Forbidden: Admin access required" }, { status: 403 });
        }

        const body = await request.json();
        const { event_id, step_number, clue_text, location_name, hint_text, admin_notes } = body;

        if (!event_id || !clue_text) {
            return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
        }

        const supabase = createAdminClient();

        if (session.role === "club_admin") {
            const { data: event } = await supabase
                .from("events")
                .select("organization_id")
                .eq("id", event_id)
                .maybeSingle();

            if (!event || event.organization_id !== session.organization_id) {
                return NextResponse.json({ success: false, message: "Forbidden: Event belongs to another club" }, { status: 403 });
            }
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
        const session = getSession(request);
        if (!session) {
            return NextResponse.json({ success: false, message: "Unauthorized: Session required" }, { status: 401 });
        }
        if (session.role === "player" || (session.role !== "super_admin" && session.role !== "club_admin")) {
            return NextResponse.json({ success: false, message: "Forbidden: Admin access required" }, { status: 403 });
        }

        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ success: false, message: "Clue ID required" }, { status: 400 });
        }

        const supabase = createAdminClient();

        if (session.role === "club_admin") {
            const { data: clue } = await supabase
                .from("clues")
                .select("event_id")
                .eq("id", id)
                .maybeSingle();

            if (!clue) {
                return NextResponse.json({ success: false, message: "Clue not found" }, { status: 404 });
            }

            const { data: event } = await supabase
                .from("events")
                .select("organization_id")
                .eq("id", clue.event_id)
                .maybeSingle();

            if (!event || event.organization_id !== session.organization_id) {
                return NextResponse.json({ success: false, message: "Forbidden: Clue belongs to another club" }, { status: 403 });
            }
        }

        const { error } = await supabase
            .from("clues")
            .update(updates)
            .eq("id", id);

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
        const session = getSession(request);
        if (!session) {
            return NextResponse.json({ success: false, message: "Unauthorized: Session required" }, { status: 401 });
        }
        if (session.role === "player" || (session.role !== "super_admin" && session.role !== "club_admin")) {
            return NextResponse.json({ success: false, message: "Forbidden: Admin access required" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ success: false, message: "Clue ID required" }, { status: 400 });
        }

        const supabase = createAdminClient();

        if (session.role === "club_admin") {
            const { data: clue } = await supabase
                .from("clues")
                .select("event_id")
                .eq("id", id)
                .maybeSingle();

            if (!clue) {
                return NextResponse.json({ success: false, message: "Clue not found" }, { status: 404 });
            }

            const { data: event } = await supabase
                .from("events")
                .select("organization_id")
                .eq("id", clue.event_id)
                .maybeSingle();

            if (!event || event.organization_id !== session.organization_id) {
                return NextResponse.json({ success: false, message: "Forbidden: Clue belongs to another club" }, { status: 403 });
            }
        }

        const { error } = await supabase.from("clues").delete().eq("id", id);

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Clue delete error:", error);
        return NextResponse.json({ success: false, message: "Failed to delete clue" }, { status: 500 });
    }
}
