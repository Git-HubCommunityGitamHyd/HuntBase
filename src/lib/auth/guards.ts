import { NextRequest, NextResponse } from "next/server";
import { getSession } from "./session";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";

export class AuthError extends Error {
    constructor(
        public statusCode: number,
        message: string
    ) {
        super(message);
        this.name = "AuthError";
    }
}

export interface AuthenticatedPlayer {
    playerId: string;
    teamId: string;
    username: string;
}

export interface AuthenticatedAdmin {
    adminId: string;
    role: "super_admin" | "club_admin";
    organizationId?: string;
}

/**
 * Validates that the request comes from an authenticated player belonging to a team.
 * If bodyTeamId is supplied, strictly asserts it matches the authenticated session.
 */
export function requirePlayerSession(
    request: NextRequest,
    bodyTeamId?: string
): AuthenticatedPlayer {
    const session = getSession(request);

    if (!session) {
        throw new AuthError(
            401,
            "Authentication required: Please log in with your team credentials."
        );
    }

    if (session.role !== "player" || !session.team_id) {
        throw new AuthError(
            403,
            "Forbidden: Only active player accounts can access gameplay endpoints."
        );
    }

    if (bodyTeamId && bodyTeamId !== session.team_id) {
        throw new AuthError(
            403,
            "Forbidden: You are not authorized to submit scans or hints for another team."
        );
    }

    return {
        playerId: session.id,
        teamId: session.team_id,
        username: session.username,
    };
}

/**
 * Validates that the request comes from an authenticated host_user or super_admin.
 * If eventId is supplied, validates that club_admins can only manage their own organization's events.
 */
export async function requireAdminSession(
    request: NextRequest,
    eventId?: string
): Promise<AuthenticatedAdmin> {
    const session = getSession(request);

    if (!session) {
        throw new AuthError(
            401,
            "Authentication required: Admin session required."
        );
    }

    if (session.role !== "super_admin" && session.role !== "club_admin") {
        throw new AuthError(
            403,
            "Forbidden: You do not have host administrative privileges."
        );
    }

    // super_admin has unrestricted access across all organizations and events
    if (session.role === "super_admin") {
        return {
            adminId: session.id,
            role: "super_admin",
            organizationId: session.organization_id,
        };
    }

    // club_admin must belong to the organization that owns the event
    if (eventId) {
        const [event] = await db
            .select({ id: events.id, organizationId: events.organizationId })
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1);

        if (!event) {
            throw new AuthError(404, "Event not found.");
        }

        if (event.organizationId !== session.organization_id) {
            throw new AuthError(
                403,
                "Forbidden: You do not have permission to manage events for this organization."
            );
        }
    }

    return {
        adminId: session.id,
        role: "club_admin",
        organizationId: session.organization_id,
    };
}

/**
 * Catches AuthError and turns it into a standardized JSON response.
 * Returns null if the error is not an AuthError.
 */
export function handleAuthError(error: unknown): NextResponse | null {
    if (error instanceof AuthError) {
        return NextResponse.json(
            { success: false, message: error.message },
            { status: error.statusCode }
        );
    }
    return null;
}
