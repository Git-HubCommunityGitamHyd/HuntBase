import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events, scans, teams } from "@/db/schema";

export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get("team_id");
    if (!teamId) return NextResponse.json({ success: false, message: "team_id is required" }, { status: 400 });
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });
    const [event] = await db.select().from(events).where(eq(events.id, team.eventId)).limit(1);
    if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
    const clueRows = await db.select().from(clues).where(eq(clues.eventId, team.eventId)).orderBy(asc(clues.stepNumber));
    const scanRows = await db.select().from(scans).where(eq(scans.teamId, team.id)).orderBy(asc(scans.scannedAt));
    const teamData = {
      id: team.id, organization_id: team.organizationId, event_id: team.eventId,
      team_name: team.teamName, score: team.score, is_disqualified: team.isDisqualified,
      current_step: team.currentStep, is_admin: false, username: null, password_hash: null,
      created_at: team.createdAt.toISOString(), min_players: team.minPlayers,
      max_players: team.maxPlayers, registration_status: team.registrationStatus,
      hunt_finished_at: team.huntFinishedAt?.toISOString() ?? null,
    };
    const eventData = {
      id: event.id, organization_id: event.organizationId, name: event.name,
      start_time: event.startTime.toISOString(), end_time: event.endTime.toISOString(),
      is_active: event.isActive, hunt_status: event.huntStatus,
      hunt_started_at: event.huntStartedAt?.toISOString() ?? null,
      hunt_ended_at: event.huntEndedAt?.toISOString() ?? null,
      hunt_duration_minutes: event.huntDurationMinutes, hint_delay_minutes: event.hintDelayMinutes,
      default_min_players: event.defaultMinPlayers, default_max_players: event.defaultMaxPlayers,
      created_at: event.createdAt.toISOString(),
    };
    const clueData = clueRows.map(c => ({ id: c.id, event_id: c.eventId, step_number: c.stepNumber, clue_text: c.clueText, hint_text: c.hintText, location_name: c.locationName, admin_notes: c.adminNotes, created_at: c.createdAt.toISOString() }));
    const scansData = scanRows.map(s => ({ id: s.id, organization_id: s.organizationId, event_id: s.eventId, team_id: s.teamId, clue_id: s.clueId, qr_code_id: s.qrCodeId, scanned_by: s.scannedBy, hint_was_used: s.hintWasUsed, points_awarded: s.pointsAwarded, scanned_at: s.scannedAt.toISOString(), clue: clueData.find(c => c.id === s.clueId) }));
    return NextResponse.json({ success: true, team: teamData, event: eventData, clues: clueData, scans: scansData, totalClues: clueData.length });
  } catch (error) {
    console.error("Progress fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch progress" }, { status: 500 });
  }
}
