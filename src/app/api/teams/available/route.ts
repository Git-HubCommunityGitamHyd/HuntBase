import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// GET - Fetch teams with available slots for registration
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const eventIdParam = searchParams.get("event_id");

        const supabase = createAdminClient();

        // Get active events (or specific event if event_id param provided)
        let eventQuery = supabase
            .from("events")
            .select("id, name, organization_id, is_active");

        if (eventIdParam) {
            eventQuery = eventQuery.eq("id", eventIdParam);
        } else {
            eventQuery = eventQuery.eq("is_active", true);
        }

        const { data: events, error: eventsError } = await eventQuery;

        if (eventsError || !events || events.length === 0) {
            return NextResponse.json({ success: true, data: [] });
        }

        const eventIds = events.map(e => e.id);
        const orgIds = Array.from(new Set(events.map(e => e.organization_id).filter(Boolean))) as string[];

        // Fetch organizations for these events
        let organizationsMap: Record<string, { id: string; name: string; slug: string }> = {};
        if (orgIds.length > 0) {
            const { data: orgs } = await supabase
                .from("organizations")
                .select("id, name, slug")
                .in("id", orgIds);

            if (orgs) {
                organizationsMap = orgs.reduce((acc, org) => {
                    acc[org.id] = org;
                    return acc;
                }, {} as Record<string, { id: string; name: string; slug: string }>);
            }
        }

        const eventsMap = events.reduce((acc, ev) => {
            acc[ev.id] = {
                id: ev.id,
                name: ev.name,
                organization: ev.organization_id ? organizationsMap[ev.organization_id] || null : null,
            };
            return acc;
        }, {} as Record<string, { id: string; name: string; organization: { id: string; name: string; slug: string } | null }>);

        // Get all non-admin teams for active events
        const { data: teams, error: teamsError } = await supabase
            .from("teams")
            .select("id, team_name, max_players, event_id")
            .eq("is_admin", false)
            .in("event_id", eventIds);

        if (teamsError) {
            return NextResponse.json({ success: false, message: teamsError.message }, { status: 500 });
        }

        if (!teams || teams.length === 0) {
            return NextResponse.json({ success: true, data: [] });
        }

        // Get member counts for each team
        const teamsWithCounts = await Promise.all(
            teams.map(async (team) => {
                const { count } = await supabase
                    .from("team_members")
                    .select("*", { count: "exact", head: true })
                    .eq("team_id", team.id);

                const ev = eventsMap[team.event_id];

                return {
                    id: team.id,
                    team_name: team.team_name,
                    event_id: team.event_id,
                    event_name: ev?.name || "Unknown Event",
                    organization: ev?.organization || null,
                    current_members: count || 0,
                    max_players: team.max_players || 2,
                };
            })
        );

        // Filter to only teams with available slots
        const availableTeams = teamsWithCounts.filter(
            t => t.current_members < t.max_players
        );

        return NextResponse.json({ success: true, data: availableTeams });
    } catch (error) {
        console.error("Available teams fetch error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch teams" }, { status: 500 });
    }
}
