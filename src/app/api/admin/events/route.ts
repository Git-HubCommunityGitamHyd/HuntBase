import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getActiveAdminSession, getAdminOwnedEvent } from "@/lib/auth/server-session";
import { eventOrganizationForCreation, isValidEventTimeRange, isValidHuntDuration, sanitizeEventUpdates } from "@/lib/auth/admin-policy";

// GET - Fetch all events
export async function GET(request: NextRequest) {
    try {
        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

        let query = supabase
            .from("events")
            .select("*")
            .order("created_at", { ascending: false });
        if (admin.role === "club_admin") {
            query = query.eq("organization_id", admin.organization_id!);
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

// POST - Create new event
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, start_time, end_time, hunt_duration_minutes = 60, hint_delay_minutes = 5 } = body;

        if (typeof name !== "string" || !name.trim() || !isValidEventTimeRange(start_time, end_time)) {
            return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
        }
        if (!isValidHuntDuration(hunt_duration_minutes)) {
            return NextResponse.json({ success: false, message: "Hunt duration must be between 1 and 1440 minutes" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const organizationId = eventOrganizationForCreation(admin, body.organization_id);
        if (!organizationId) {
            return NextResponse.json({ success: false, message: "Organization ID is required for event creation" }, { status: 400 });
        }
        if (admin.role === "super_admin" && body.organization_id) {
            const { data: organization, error: organizationError } = await supabase
                .from("organizations")
                .select("id")
                .eq("id", organizationId)
                .maybeSingle();
            if (organizationError) {
                return NextResponse.json({ success: false, message: "Unable to verify organization" }, { status: 503 });
            }
            if (!organization) return NextResponse.json({ success: false, message: "Organization not found" }, { status: 404 });
        }
        
        // Check if event name already exists
        const { data: existingEvent, error: existingEventError } = await supabase
            .from("events")
            .select("id")
            .eq("name", name)
            .eq("organization_id", organizationId)
            .maybeSingle();
        if (existingEventError) {
            return NextResponse.json({ success: false, message: "Unable to check event name" }, { status: 503 });
        }
        
        if (existingEvent) {
            return NextResponse.json({ success: false, message: "An event with this name already exists" }, { status: 400 });
        }
        const { data, error } = await supabase
            .from("events")
            .insert({
                name,
                start_time: new Date(start_time).toISOString(),
                end_time: new Date(end_time).toISOString(),
                organization_id: organizationId,
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

// PUT - Update event
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id } = body;

        if (typeof id !== "string" || !id) {
            return NextResponse.json({ success: false, message: "Event ID required" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const event = await getAdminOwnedEvent(admin, id, supabase);
        if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
        const updates = sanitizeEventUpdates(body);
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ success: false, message: "No supported event fields supplied" }, { status: 400 });
        }

        if (Object.hasOwn(updates, "hunt_duration_minutes") && !isValidHuntDuration(updates.hunt_duration_minutes)) {
            return NextResponse.json({ success: false, message: "Hunt duration must be between 1 and 1440 minutes" }, { status: 400 });
        }

        if (Object.hasOwn(updates, "start_time") || Object.hasOwn(updates, "end_time")) {
            let timeQuery = supabase.from("events").select("start_time, end_time").eq("id", id);
            timeQuery = event.organization_id
                ? timeQuery.eq("organization_id", event.organization_id)
                : timeQuery.is("organization_id", null);
            const { data: currentTimes, error: timeError } = await timeQuery.maybeSingle();
            if (timeError) return NextResponse.json({ success: false, message: "Unable to validate event times" }, { status: 503 });
            if (!currentTimes) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
            const startTime = updates.start_time ?? currentTimes.start_time;
            const endTime = updates.end_time ?? currentTimes.end_time;
            if (typeof startTime !== "string" || typeof endTime !== "string" || !isValidEventTimeRange(startTime, endTime)) {
                return NextResponse.json({ success: false, message: "Event end time must be after a valid start time" }, { status: 400 });
            }
            if (Object.hasOwn(updates, "start_time")) updates.start_time = new Date(startTime).toISOString();
            if (Object.hasOwn(updates, "end_time")) updates.end_time = new Date(endTime).toISOString();
        }
        
        // Check if event name already exists (excluding current event)
        if (updates.name) {
            let nameQuery = supabase
                .from("events")
                .select("id")
                .eq("name", updates.name)
                .neq("id", id);
            nameQuery = event.organization_id
                ? nameQuery.eq("organization_id", event.organization_id)
                : nameQuery.is("organization_id", null);
            const { data: existingEvent, error: nameError } = await nameQuery.maybeSingle();
            if (nameError) return NextResponse.json({ success: false, message: "Unable to check event name" }, { status: 503 });
            
            if (existingEvent) {
                return NextResponse.json({ success: false, message: "An event with this name already exists" }, { status: 400 });
            }
        }

        let updateQuery = supabase
            .from("events")
            .update(updates)
            .eq("id", id);
        updateQuery = event.organization_id
            ? updateQuery.eq("organization_id", event.organization_id)
            : updateQuery.is("organization_id", null);
        const { data: updatedEvent, error } = await updateQuery.select("id").maybeSingle();

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }
        if (!updatedEvent) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

        // Activate the target first so a failed target update cannot leave the tenant with no active event.
        if (updates.is_active === true) {
            let deactivateQuery = supabase
                .from("events")
                .update({ is_active: false })
                .neq("id", id);
            deactivateQuery = event.organization_id
                ? deactivateQuery.eq("organization_id", event.organization_id)
                : deactivateQuery.is("organization_id", null);
            const { error: deactivateError } = await deactivateQuery;
            if (deactivateError) {
                return NextResponse.json({ success: false, message: "Event activated, but other events could not be deactivated" }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Event update error:", error);
        return NextResponse.json({ success: false, message: "Failed to update event" }, { status: 500 });
    }
}

// DELETE - Delete event
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ success: false, message: "Event ID required" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const event = await getAdminOwnedEvent(admin, id, supabase);
        if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

        let deleteQuery = supabase.from("events").delete().eq("id", id);
        deleteQuery = event.organization_id
            ? deleteQuery.eq("organization_id", event.organization_id)
            : deleteQuery.is("organization_id", null);
        const { data: deletedEvent, error } = await deleteQuery.select("id").maybeSingle();

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }
        if (!deletedEvent) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Event delete error:", error);
        return NextResponse.json({ success: false, message: "Failed to delete event" }, { status: 500 });
    }
}
