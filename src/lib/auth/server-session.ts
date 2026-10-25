import type { NextRequest } from "next/server";
import { getAdminSession, getPlayerSession, type SessionClaims } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { adminAccountMatchesSession, canAccessOrganization, canAccessTeamForAdmin, legacyAdminMatchesSession } from "@/lib/auth/admin-policy";

type SupabaseClient = ReturnType<typeof createAdminClient>;
type AdminRole = Extract<SessionClaims["role"], "super_admin" | "club_admin">;
export type AdminSessionClaims = Omit<SessionClaims, "role"> & { role: AdminRole };

function isAdminSession(session: SessionClaims | null): session is AdminSessionClaims {
    return session !== null && (session.role === "super_admin" || session.role === "club_admin");
}

/** Revalidates the signed administrator identity against its current account record. */
export async function getActiveAdminSession(
    request: NextRequest,
    supabase: SupabaseClient = createAdminClient()
): Promise<AdminSessionClaims | null> {
    const session = getAdminSession(request);
    if (!isAdminSession(session)) return null;

    const { data: hostUser, error: hostError } = await supabase
        .from("host_users")
        .select("id, organization_id, role, is_active")
        .eq("id", session.id)
        .maybeSingle();

    if (hostError) return null;
    if (hostUser) {
        if (!adminAccountMatchesSession(session, hostUser)) return null;
        if (hostUser.organization_id) {
            const { data: organization, error } = await supabase
                .from("organizations")
                .select("id")
                .eq("id", hostUser.organization_id)
                .maybeSingle();
            if (error || !organization) return null;
        } else if (session.role !== "super_admin") {
            return null;
        }
        return session;
    }

    // Retain the legacy team-admin login only when its stored tenant is real and matches the token.
    const { data: legacyAdmin, error: legacyError } = await supabase
        .from("teams")
        .select("id, organization_id, is_admin")
        .eq("id", session.id)
        .eq("is_admin", true)
        .maybeSingle();
    if (legacyError || !legacyAdmin || !legacyAdminMatchesSession(session, legacyAdmin)) return null;
    const legacyOrganizationId = legacyAdmin.organization_id;
    if (typeof legacyOrganizationId !== "string" || legacyOrganizationId.length === 0) return null;

    const { data: organization, error: organizationError } = await supabase
        .from("organizations")
        .select("id")
        .eq("id", legacyOrganizationId)
        .maybeSingle();
    return organizationError || !organization ? null : session;
}

/** Returns an event only if it belongs to the currently authorized admin tenant. */
export async function getAdminOwnedEvent(
    admin: AdminSessionClaims,
    eventId: string,
    supabase: SupabaseClient = createAdminClient()
): Promise<{ id: string; organization_id: string | null } | null> {
    if (!eventId) return null;
    const { data: event, error } = await supabase
        .from("events")
        .select("id, organization_id")
        .eq("id", eventId)
        .maybeSingle();
    if (error || !event || !canAccessOrganization(admin, event.organization_id)) return null;
    return event;
}

/** Resolves clue ownership through the schema's clue -> event -> organization relationship. */
export async function getAdminOwnedClue(
    admin: AdminSessionClaims,
    clueId: string,
    supabase: SupabaseClient = createAdminClient()
): Promise<{ id: string; event_id: string } | null> {
    if (!clueId) return null;
    const { data: clue, error } = await supabase
        .from("clues")
        .select("id, event_id")
        .eq("id", clueId)
        .maybeSingle();
    if (error || !clue?.event_id) return null;
    return await getAdminOwnedEvent(admin, clue.event_id, supabase) ? clue : null;
}

/** Resolves team tenant ownership through team.event_id, allowing legacy null organization_id values. */
export async function getAdminOwnedTeam(
    admin: AdminSessionClaims,
    teamId: string,
    supabase: SupabaseClient = createAdminClient()
): Promise<{ id: string; event_id: string; organization_id: string | null } | null> {
    if (!teamId) return null;
    const { data: team, error } = await supabase
        .from("teams")
        .select("id, event_id, organization_id")
        .eq("id", teamId)
        .maybeSingle();
    if (error || !team?.event_id) return null;
    const event = await getAdminOwnedEvent(admin, team.event_id, supabase);
    if (!event || !canAccessTeamForAdmin(admin, team.organization_id, event.organization_id)) return null;
    return team;
}

/** Confirms the player is still a member of the team bound into the signed session. */
export async function getCurrentPlayerSession(
    request: NextRequest,
    supabase: SupabaseClient = createAdminClient()
): Promise<SessionClaims | null> {
    const session = getPlayerSession(request);
    if (!session?.team_id) return null;

    const { data: member, error: memberError } = await supabase
        .from("team_members")
        .select("id, team_id")
        .eq("id", session.id)
        .eq("team_id", session.team_id)
        .maybeSingle();
    if (memberError || !member) return null;

    const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("id, event_id, is_disqualified")
        .eq("id", session.team_id)
        .maybeSingle();
    if (teamError || !team || team.is_disqualified || !team.event_id) return null;

    const { data: event, error: eventError } = await supabase
        .from("events")
        .select("id, is_active, hunt_started_at")
        .eq("id", team.event_id)
        .maybeSingle();
    if (eventError || !event || !event.is_active || !event.hunt_started_at) return null;

    return session;
}
