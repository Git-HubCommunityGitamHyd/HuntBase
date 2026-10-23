import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

// GET - Fetch events (scoped to organization for club_admin)
export async function GET(request: NextRequest) {
    try {
        const session = getSession(request);
        const { searchParams } = new URL(request.url);
        const orgFilter = searchParams.get("organization_id");

        const supabase = createAdminClient();
        let query = supabase
            .from("events")
            .select("*")
            .order("created_at", { ascending: false });

        // If club_admin, restrict strictly to their organization
        if (session?.role === "club_admin" && session.organization_id) {
            query = query.eq("organization_id", session.organization_id);
        } else if (orgFilter) {
            query = query.eq("organization_id", orgFilter);
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Events fetch error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch events" }, { status: 500 });
    }
}

// POST - Create new event scoped to the host organization
export async function POST(request: NextRequest) {
    try {
        const session = getSession(request);
        const body = await request.json();
        const { name, start_time, end_time, hunt_duration_minutes = 60, hint_delay_minutes = 5 } = body;

        if (!name || !start_time || !end_time) {
            return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
        }

        const supabase = createAdminClient();

        // Determine organization_id: session > body > default org
        let targetOrgId = session?.organization_id || body.organization_id;
        if (!targetOrgId) {
            const { data: defaultOrg } = await supabase
                .from("organizations")
                .select("id")
                .eq("slug", "github-community")
                .maybeSingle();

            targetOrgId = defaultOrg?.id;
        }

        if (!targetOrgId) {
            const { data: firstOrg } = await supabase.from("organizations").select("id").limit(1).single();
            targetOrgId = firstOrg?.id;
        }

        // Check if event name already exists for this organization
        let existingQuery = supabase
            .from("events")
            .select("id")
            .eq("name", name);

        if (targetOrgId) {
            existingQuery = existingQuery.eq("organization_id", targetOrgId);
        }

        const { data: existingEvent } = await existingQuery.maybeSingle();

        if (existingEvent) {
            return NextResponse.json(
                { success: false, message: "An event with this name already exists in your club" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("events")
            .insert({
                organization_id: targetOrgId,
                name,
                start_time: new Date(start_time).toISOString(),
                end_time: new Date(end_time).toISOString(),
                is_active: false,
                hunt_duration_minutes,
                hint_delay_minutes,
            })
            .select()
            .single();

        if (error) {
            console.error("Event insert error:", error);
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Event creation error:", error);
        return NextResponse.json({ success: false, message: "Failed to create event" }, { status: 500 });
    }
}

// PUT - Update event (scoped activation per club)
export async function PUT(request: NextRequest) {
    try {
        const session = getSession(request);
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ success: false, message: "Event ID required" }, { status: 400 });
        }

        const supabase = createAdminClient();

        // Fetch current event to check ownership and org
        const { data: currentEvent, error: currentError } = await supabase
            .from("events")
            .select("id, organization_id")
            .eq("id", id)
            .maybeSingle();

        if (currentError || !currentEvent) {
            return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
        }

        // Check ownership if club_admin
        if (session?.role === "club_admin" && session.organization_id && currentEvent.organization_id !== session.organization_id) {
            return NextResponse.json({ success: false, message: "Unauthorized to edit this event" }, { status: 403 });
        }

        // Check if event name already exists within the same organization
        if (updates.name && currentEvent.organization_id) {
            const { data: existingEvent } = await supabase
                .from("events")
                .select("id")
                .eq("name", updates.name)
                .eq("organization_id", currentEvent.organization_id)
                .neq("id", id)
                .maybeSingle();

            if (existingEvent) {
                return NextResponse.json(
                    { success: false, message: "An event with this name already exists in your club" },
                    { status: 400 }
                );
            }
        }

        // If activating, only deactivate all other events for THIS specific organization
        if (updates.is_active === true && currentEvent.organization_id) {
            await supabase
                .from("events")
                .update({ is_active: false })
                .eq("organization_id", currentEvent.organization_id)
                .neq("id", id);
        }

        const { error } = await supabase
            .from("events")
            .update(updates)
            .eq("id", id);

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Event update error:", error);
        return NextResponse.json({ success: false, message: "Failed to update event" }, { status: 500 });
    }
}

// DELETE - Delete event (scoped per club)
export async function DELETE(request: NextRequest) {
    try {
        const session = getSession(request);
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ success: false, message: "Event ID required" }, { status: 400 });
        }

        const supabase = createAdminClient();

        // Check ownership if club_admin
        if (session?.role === "club_admin" && session.organization_id) {
            const { data: currentEvent } = await supabase
                .from("events")
                .select("organization_id")
                .eq("id", id)
                .maybeSingle();

            if (currentEvent && currentEvent.organization_id !== session.organization_id) {
                return NextResponse.json({ success: false, message: "Unauthorized to delete this event" }, { status: 403 });
            }
        }

        const { error } = await supabase.from("events").delete().eq("id", id);

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Event delete error:", error);
        return NextResponse.json({ success: false, message: "Failed to delete event" }, { status: 500 });
    }
}
