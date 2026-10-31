import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events, fakeQrScans, qrCodes, scans, teams } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const eventId = request.nextUrl.searchParams.get("event_id");
    if (!eventId) return NextResponse.json({ success: false, message: "event_id is required" }, { status: 400 });

    const [event] = await db
      .select({ id: events.id, organizationId: events.organizationId })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
    }

    if (auth.role !== "super_admin" && event.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You do not have access to this event's data" },
        { status: 403 }
      );
    }

    const [teamRows, clueRows, scanRows, fakeRows] = await Promise.all([
      db.select().from(teams).where(eq(teams.eventId, eventId)).orderBy(desc(teams.score)),
      db.select().from(clues).where(eq(clues.eventId, eventId)),
      db.select().from(scans).where(eq(scans.eventId, eventId)).orderBy(desc(scans.scannedAt)),
      db.select({ scan: fakeQrScans, team: teams, qr: qrCodes })
        .from(fakeQrScans).innerJoin(teams, eq(teams.id, fakeQrScans.teamId))
        .innerJoin(qrCodes, eq(qrCodes.id, fakeQrScans.qrCodeId))
        .where(eq(fakeQrScans.eventId, eventId)).orderBy(desc(fakeQrScans.scannedAt)).limit(20),
    ]);

    const teamData = teamRows.map(t => ({
      id: t.id,
      organization_id: t.organizationId,
      event_id: t.eventId,
      team_name: t.teamName,
      username: null,
      password_hash: null,
      score: t.score,
      is_disqualified: t.isDisqualified,
      current_step: t.currentStep,
      is_admin: false,
      created_at: t.createdAt.toISOString(),
      min_players: t.minPlayers,
      max_players: t.maxPlayers,
      registration_status: t.registrationStatus,
      hunt_finished_at: t.huntFinishedAt?.toISOString() ?? null,
      lastScan: scanRows.find(s => s.teamId === t.id)
        ? { scanned_at: scanRows.find(s => s.teamId === t.id)!.scannedAt.toISOString() }
        : undefined,
    }));

    const clueData = clueRows.map(c => ({
      id: c.id,
      event_id: c.eventId,
      step_number: c.stepNumber,
      clue_text: c.clueText,
      hint_text: c.hintText,
      location_name: c.locationName,
      admin_notes: c.adminNotes,
      created_at: c.createdAt.toISOString(),
    }));

    const fakeScanData = fakeRows.map(({ scan, team, qr }) => ({
      id: scan.id,
      event_id: scan.eventId,
      team_id: scan.teamId,
      qr_code_id: scan.qrCodeId,
      scanned_at: scan.scannedAt.toISOString(),
      team: { id: team.id, team_name: team.teamName },
      qr_code: { id: qr.id, fake_label: qr.fakeLabel, qr_token: qr.qrToken },
    }));

    return NextResponse.json({
      success: true,
      teams: teamData,
      clues: clueData,
      scans: scanRows,
      fakeScans: fakeScanData,
      totalClues: clueRows.length,
    });
  } catch (error) {
    console.error("Monitor data fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch monitor data" }, { status: 500 });
  }
}
