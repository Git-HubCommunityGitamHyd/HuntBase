import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events, scans, teams } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
    try {
        // High-priority Issue 4: Authenticate progress requests
        const session = await getSession(request);
        if (!session) {
            return NextResponse.json(
                { success: false, message: "Authentication required" },
                { status: 401 }
            );
        }

        const requestedTeamId = request.nextUrl.searchParams.get("team_id");
        const teamId = requestedTeamId || (session.kind === "player" ? session.teamId : null);

        if (!teamId) {
            return NextResponse.json({ success: false, message: "team_id is required" }, { status: 400 });
        }

        const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
        if (!team) {
            return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });
        }

        const [event] = await db.select().from(events).where(eq(events.id, team.eventId)).limit(1);
        if (!event) {
            return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
        }

        // Authorization checks
        const isAdmin = session.kind === "admin";
        if (session.kind === "player") {
            if (session.teamId !== team.id) {
                return NextResponse.json(
                    { success: false, message: "Forbidden: You cannot view progress for another team" },
                    { status: 403 }
                );
            }
        } else if (isAdmin) {
            if (session.role !== "super_admin" && session.organizationId !== team.organizationId) {
                return NextResponse.json(
                    { success: false, message: "Forbidden: You do not have access to this organization's teams" },
                    { status: 403 }
                );
            }
        }

        const clueRows = await db
            .select()
            .from(clues)
            .where(eq(clues.eventId, team.eventId))
            .orderBy(asc(clues.stepNumber));

        const scanRows = await db
            .select()
            .from(scans)
            .where(eq(scans.teamId, team.id))
            .orderBy(asc(scans.scannedAt));

        const teamData = {
            id: team.id,
            organization_id: team.organizationId,
            event_id: team.eventId,
            team_name: team.teamName,
            score: team.score,
            current_step: team.currentStep,
            is_disqualified: team.isDisqualified,
            hunt_finished_at: team.huntFinishedAt?.toISOString() ?? null,
            created_at: team.createdAt.toISOString(),
            players: [],
        };

        const eventData = {
            id: event.id,
            organization_id: event.organizationId,
            name: event.name,
            start_time: event.startTime.toISOString(),
            end_time: event.endTime.toISOString(),
            hunt_started_at: event.huntStartedAt?.toISOString() ?? null,
            hunt_ended_at: event.huntEndedAt?.toISOString() ?? null,
            is_active: event.isActive,
            hunt_status: event.huntStatus,
            hunt_duration_minutes: event.huntDurationMinutes,
            hint_delay_minutes: event.hintDelayMinutes,
            default_min_players: event.defaultMinPlayers,
            default_max_players: event.defaultMaxPlayers,
            created_at: event.createdAt.toISOString(),
        };

        // High-priority Issue 8: Keep location and admin notes strictly hidden according to player disclosure policy
        const solvedClueIds = new Set(scanRows.map((s) => s.clueId));

        const safeClueData = clueRows.map((c) => {
            if (isAdmin) {
                return {
                    id: c.id,
                    event_id: c.eventId,
                    step_number: c.stepNumber,
                    clue_text: c.clueText,
                    hint_text: c.hintText,
                    location_name: c.locationName,
                    admin_notes: c.adminNotes,
                    created_at: c.createdAt.toISOString(),
                };
            }

            // For players: NEVER expose location_name or admin_notes, even for solved clues
            const isSolved = solvedClueIds.has(c.id);
            return {
                id: c.id,
                event_id: c.eventId,
                step_number: c.stepNumber,
                clue_text: isSolved ? c.clueText : "Locked Checkpoint",
                hint_text: isSolved ? c.hintText : null,
                location_name: null, // Strictly null for players (Item 8)
                admin_notes: null,   // Strictly null for players
                created_at: c.createdAt.toISOString(),
            };
        });

        const scansData = scanRows.map((s) => ({
            id: s.id,
            organization_id: s.organizationId,
            event_id: s.eventId,
            team_id: s.teamId,
            clue_id: s.clueId,
            qr_code_id: s.qrCodeId,
            scanned_by: s.scannedBy,
            hint_was_used: s.hintWasUsed,
            points_awarded: s.pointsAwarded,
            scanned_at: s.scannedAt.toISOString(),
            clue: safeClueData.find((c) => c.id === s.clueId),
        }));

        return NextResponse.json({
            success: true,
            team: teamData,
            event: eventData,
            clues: safeClueData,
            scans: scansData,
        });
    } catch (error) {
        console.error("Progress fetch error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch team progress" },
            { status: 500 }
        );
    }
}
