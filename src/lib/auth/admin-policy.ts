export interface AdminTenantIdentity {
    role: "super_admin" | "club_admin";
    organization_id?: string;
}

export interface CurrentAdminAccount {
    id: string;
    role: string;
    organization_id?: string | null;
    is_active: boolean | null;
}

export interface LegacyAdminAccount {
    id: string;
    organization_id?: string | null;
    is_admin: boolean | null;
}

export function adminAccountMatchesSession(
    session: (AdminTenantIdentity & { id: string }) | null | undefined,
    account: CurrentAdminAccount | null | undefined
): boolean {
    return !!session && !!account &&
        account.is_active === true &&
        account.id === session.id &&
        account.role === session.role &&
        (account.organization_id ?? undefined) === session.organization_id &&
        (session.role === "super_admin" || (!!session.organization_id && session.role === "club_admin"));
}

export function legacyAdminMatchesSession(
    session: (AdminTenantIdentity & { id: string }) | null | undefined,
    account: LegacyAdminAccount | null | undefined
): boolean {
    return !!session && !!account &&
        account.is_admin === true &&
        account.id === session.id &&
        session.role === "club_admin" &&
        !!account.organization_id &&
        account.organization_id === session.organization_id;
}

const CLUE_UPDATE_FIELDS = new Set([
    "step_number",
    "clue_text",
    "location_name",
    "hint_text",
    "admin_notes",
]);
const EVENT_UPDATE_FIELDS = new Set([
    "name",
    "start_time",
    "end_time",
    "is_active",
    "hunt_duration_minutes",
    "hint_delay_minutes",
]);
const TEAM_UPDATE_FIELDS = new Set(["score", "is_disqualified"]);

/** Prevents clue updates from transferring tenant ownership or injecting identity claims. */
export function sanitizeClueUpdates(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter(([key]) => CLUE_UPDATE_FIELDS.has(key))
    );
}

export function eventOrganizationForCreation(
    admin: AdminTenantIdentity,
    requestedOrganizationId: unknown
): string | null {
    if (admin.role === "club_admin") return admin.organization_id || null;
    if (typeof requestedOrganizationId === "string" && requestedOrganizationId.length > 0) {
        return requestedOrganizationId;
    }
    return admin.organization_id || null;
}

/** Event ownership is immutable through this route; only supported event fields are writable. */
export function sanitizeEventUpdates(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter(([key]) => EVENT_UPDATE_FIELDS.has(key))
    );
}

export function isValidHuntDuration(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 1440;
}

export function isValidEventTimeRange(startTime: unknown, endTime: unknown): boolean {
    if (typeof startTime !== "string" || typeof endTime !== "string" || !startTime || !endTime) return false;
    const start = Date.parse(startTime);
    const end = Date.parse(endTime);
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

/** Null team organization IDs are legacy-compatible; event_id remains the tenant link. */
export function teamOrganizationMatchesEvent(
    teamOrganizationId: string | null | undefined,
    eventOrganizationId: string | null | undefined
): boolean {
    return teamOrganizationId == null || teamOrganizationId === (eventOrganizationId ?? null);
}
/** A team is accessible only through an event the admin may access and a consistent tenant link. */
export function canAccessTeamForAdmin(
    admin: AdminTenantIdentity | null | undefined,
    teamOrganizationId: string | null | undefined,
    eventOrganizationId: string | null | undefined
): boolean {
    return teamOrganizationMatchesEvent(teamOrganizationId, eventOrganizationId) &&
        canAccessOrganization(admin, eventOrganizationId);
}

export const MAX_GENERATED_TEAMS_PER_REQUEST = 100;
export const MAX_TEAM_SCORE = 2_147_483_647;

export function isValidTeamGenerationCount(count: unknown): count is number {
    return typeof count === "number" && Number.isSafeInteger(count) &&
        count >= 1 && count <= MAX_GENERATED_TEAMS_PER_REQUEST;
}

export function sanitizeTeamUpdates(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const updates: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
        if (!TEAM_UPDATE_FIELDS.has(key)) continue;
        if (key === "score" && (typeof fieldValue !== "number" || !Number.isSafeInteger(fieldValue) || fieldValue < 0)) return null;
        if (key === "is_disqualified" && typeof fieldValue !== "boolean") return null;
        updates[key] = fieldValue;
    }
    return Object.keys(updates).length ? updates : null;
}

export function isValidScoreAdjustment(adjustment: unknown): adjustment is number {
    return typeof adjustment === "number" && Number.isSafeInteger(adjustment) && adjustment % 5 === 0;
}

export function adjustedScore(currentScore: unknown, adjustment: unknown): number | null {
    if (typeof currentScore !== "number" || !Number.isSafeInteger(currentScore) || currentScore < 0 || currentScore > MAX_TEAM_SCORE) return null;
    if (!isValidScoreAdjustment(adjustment)) return null;
    const result = Math.max(0, currentScore + adjustment);
    return Number.isSafeInteger(result) && result <= MAX_TEAM_SCORE ? result : null;
}

export function isValidTeamCapacity(minPlayers: unknown, maxPlayers: unknown): boolean {
    return typeof minPlayers === "number" && Number.isSafeInteger(minPlayers) && minPlayers >= 1 &&
        typeof maxPlayers === "number" && Number.isSafeInteger(maxPlayers) && maxPlayers >= minPlayers;
}

/** Super admins may access any tenant; club admins are confined to their current tenant. */
export function canAccessOrganization(
    admin: AdminTenantIdentity | null | undefined,
    resourceOrganizationId: string | null | undefined
): boolean {
    if (!admin) return false;
    if (admin.role === "super_admin") return true;
    return admin.role === "club_admin" &&
        typeof resourceOrganizationId === "string" &&
        resourceOrganizationId.length > 0 &&
        admin.organization_id === resourceOrganizationId;
}
