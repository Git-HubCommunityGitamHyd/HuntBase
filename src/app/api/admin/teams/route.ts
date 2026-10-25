import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getActiveAdminSession, getAdminOwnedEvent, getAdminOwnedTeam } from "@/lib/auth/server-session";
import { isValidTeamCapacity, sanitizeTeamUpdates, teamOrganizationMatchesEvent } from "@/lib/auth/admin-policy";

// GET - Fetch all teams for an event
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
        const event = await getAdminOwnedEvent(admin, eventId, supabase);
        if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

        const { data, error } = await supabase
            .from("teams")
            .select("id, event_id, organization_id, team_name, min_players, max_players, registration_status, score, is_disqualified, current_step, hunt_finished_at, created_at")
            .eq("event_id", eventId)
            .eq("is_admin", false)
            .order("created_at", { ascending: true });

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }
        if ((data || []).some((team) => !teamOrganizationMatchesEvent(team.organization_id, event.organization_id))) {
            return NextResponse.json({ success: false, message: "Team organization data is inconsistent with the event" }, { status: 409 });
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
        const { event_id, team_name } = body;
        const normalizedTeamName = typeof team_name === "string" ? team_name.trim() : "";
        const min_players = body.min_players ?? 2;
        const max_players = body.max_players ?? 2;

        if (typeof event_id !== "string" || !event_id || !normalizedTeamName) {
            return NextResponse.json(
                { success: false, message: "Event ID and team name are required" },
                { status: 400 }
            );
        }
        if (!isValidTeamCapacity(min_players, max_players)) {
            return NextResponse.json({ success: false, message: "Player limits must be positive integers and minimum cannot exceed maximum" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const event = await getAdminOwnedEvent(admin, event_id, supabase);
        if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

        // Check if team name already exists for this event
        const { data: existing, error: existingError } = await supabase
            .from("teams")
            .select("id")
            .eq("event_id", event_id)
            .eq("team_name", normalizedTeamName)
            .eq("is_admin", false)
            .maybeSingle();

        if (existingError) {
            return NextResponse.json({ success: false, message: "Unable to check team name" }, { status: 503 });
        }

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
                organization_id: event.organization_id,
                team_name: normalizedTeamName,
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
        const { id } = body;

        if (typeof id !== "string" || !id) {
            return NextResponse.json({ success: false, message: "Team ID required" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const team = await getAdminOwnedTeam(admin, id, supabase);
        if (!team) return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });
        const updates = sanitizeTeamUpdates(body);
        if (!updates) {
            return NextResponse.json({ success: false, message: "No valid team fields supplied" }, { status: 400 });
        }

        let updateQuery = supabase
            .from("teams")
            .update(updates)
            .eq("id", id)
            .eq("event_id", team.event_id);
        updateQuery = team.organization_id
            ? updateQuery.eq("organization_id", team.organization_id)
            : updateQuery.is("organization_id", null);
        const { data: updatedTeam, error } = await updateQuery.select("id").maybeSingle();

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }
        if (!updatedTeam) return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });

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
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const team = await getAdminOwnedTeam(admin, id, supabase);
        if (!team) return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });

        // Delete team (cascade will handle team_members deletion)
        let deleteQuery = supabase
            .from("teams")
            .delete()
            .eq("id", id)
            .eq("event_id", team.event_id);
        deleteQuery = team.organization_id
            ? deleteQuery.eq("organization_id", team.organization_id)
            : deleteQuery.is("organization_id", null);
        const { data: deletedTeam, error } = await deleteQuery.select("id").maybeSingle();

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }
        if (!deletedTeam) return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Team delete error:", error);
        return NextResponse.json({ success: false, message: "Failed to delete team" }, { status: 500 });
    }
}
