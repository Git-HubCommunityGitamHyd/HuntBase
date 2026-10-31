import { and, count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events, fakeQrScans, qrCodes, scans, teamClueOrder, teamMembers, teams } from "@/db/schema";

export async function POST(request: NextRequest) {
  try {
    const { token, team_id, player_id } = await request.json();
    if (!token || !team_id) return NextResponse.json({ success: false, message: "Missing token or team_id" }, { status: 400 });

    const result = await db.transaction(async (tx) => {
      const [team] = await tx.select().from(teams).where(eq(teams.id, team_id)).limit(1).for("update");
      if (!team) return { status: 404, body: { success: false, message: "Team not found" } };
      if (team.isDisqualified) return { status: 403, body: { success: false, message: "Your team has been disqualified" } };
      const [event] = await tx.select().from(events).where(eq(events.id, team.eventId)).limit(1);
      if (!event) return { status: 404, body: { success: false, message: "Event not found" } };
      const now = new Date();
      if (!event.isActive || !event.huntStartedAt) return { status: 403, body: { success: false, message: "The hunt is not currently active" } };
      if (now.getTime() > event.huntStartedAt.getTime() + event.huntDurationMinutes * 60000) return { status: 403, body: { success: false, message: "Time's up! The hunt has ended." } };
      if (now < event.startTime) return { status: 403, body: { success: false, message: "The event hasn't started yet" } };
      if (now > event.endTime) return { status: 403, body: { success: false, message: "The event has ended" } };
      if (player_id) {
        const [member] = await tx.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.id, player_id), eq(teamMembers.teamId, team.id))).limit(1);
        if (!member) return { status: 403, body: { success: false, message: "Player does not belong to this team" } };
      }
      const [qr] = await tx.select().from(qrCodes).where(and(eq(qrCodes.qrToken, String(token).trim()), eq(qrCodes.eventId, team.eventId))).limit(1);
      if (!qr) return { status: 400, body: { success: false, message: "Invalid checkpoint QR code for this event" } };
      if (qr.isFake) {
        const [scanner] = await tx.select({ id: teamMembers.id }).from(teamMembers)
          .where(player_id
            ? and(eq(teamMembers.id, player_id), eq(teamMembers.teamId, team.id))
            : eq(teamMembers.teamId, team.id))
          .limit(1);
        if (scanner) await tx.insert(fakeQrScans).values({ organizationId: team.organizationId, eventId: team.eventId, qrCodeId: qr.id, teamId: team.id, playerId: scanner.id });
        return { status: 200, body: { success: false, message: "Decoy checkpoint! You scanned a decoy QR code!", isFake: true, redirect_url: qr.redirectUrl, fake_label: qr.fakeLabel } };
      }
      const [expected] = await tx.select().from(teamClueOrder).where(and(eq(teamClueOrder.teamId, team.id), eq(teamClueOrder.stepIndex, team.currentStep))).limit(1);
      if (!expected) return { status: 400, body: { success: false, message: "All clues have already been completed for your team!" } };
      if (qr.clueId !== expected.clueId) return { status: 400, body: { success: false, message: "Wrong checkpoint! This is not your team's assigned next clue." } };
      const [{ totalClues }] = await tx.select({ totalClues: count() }).from(clues).where(eq(clues.eventId, team.eventId));
      const points = expected.hintViewed ? 5 : 10;
      const nextStep = team.currentStep + 1;
      const complete = nextStep >= totalClues;
      await tx.insert(scans).values({ organizationId: team.organizationId, eventId: team.eventId, teamId: team.id, clueId: expected.clueId, qrCodeId: qr.id, scannedBy: player_id || null, hintWasUsed: expected.hintViewed, pointsAwarded: points });
      await tx.update(teams).set({ score: team.score + points, currentStep: nextStep, ...(complete && { huntFinishedAt: now }) }).where(eq(teams.id, team.id));
      return { status: 200, body: { success: true, message: complete ? "Victory! Your team has solved all clues and finished the hunt!" : `Checkpoint verified! +${points} points${expected.hintViewed ? " (hint used)" : ""}. Move to the next clue!`, newScore: team.score + points, nextStep, isComplete: complete, pointsEarned: points, hintUsed: expected.hintViewed } };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ success: false, message: "Your team has already verified this clue!" }, { status: 400 });
    }
    console.error("Scan route error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred" }, { status: 500 });
  }
}
