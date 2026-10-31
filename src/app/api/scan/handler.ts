import { and, count, eq, gte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  clues,
  eventPauses,
  events,
  fakeQrScans,
  qrCodes,
  scans,
  teamClueOrder,
  teams,
} from "@/db/schema";
import { requireVerifiedPlayer } from "@/lib/auth/session";
import type { SessionResolver } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db-errors";

// One message for "unknown code" and "real code, wrong clue", so codes can't be probed.
const NOT_YOUR_CHECKPOINT =
  "That's not the checkpoint for your current clue. Re-read your clue and try again.";

type Outcome = { status: number; body: Record<string, unknown> };
const reply = (status: number, message: string, extra: Record<string, unknown> = {}): Outcome => ({
  status,
  body: { success: false, message, ...extra },
});

export async function handleScan(request: NextRequest, resolveSession?: SessionResolver) {
  try {
    // Team and player come from the session. Anything in the body about them is ignored.
    const auth = await requireVerifiedPlayer(request, resolveSession);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 100) {
      return NextResponse.json(
        { success: false, message: "Missing or invalid token" },
        { status: 400 }
      );
    }

    const result: Outcome = await db.transaction(async (tx) => {
      // Lock this team's row: scans by the same team wait their turn.
      const [team] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, auth.teamId))
        .limit(1)
        .for("update");
      if (!team) return reply(404, "Team not found");
      if (team.isDisqualified) return reply(403, "Your team has been disqualified");
      if (team.huntFinishedAt) {
        return reply(400, "Your team has already solved all clues and completed the hunt!");
      }

      const [event] = await tx.select().from(events).where(eq(events.id, team.eventId)).limit(1);
      if (!event) return reply(404, "Event not found");

      const now = new Date();
      if (event.huntStatus === "paused") {
        return reply(403, "The hunt is currently paused by organizers.");
      }
      if (!event.isActive || event.huntStatus !== "active" || !event.huntStartedAt) {
        return reply(403, "The hunt is not currently active");
      }
      if (now < event.startTime) return reply(403, "The event hasn't started yet");
      if (now > event.endTime) return reply(403, "The event has ended");

      // Time spent paused does not count against the hunt.
      const pauses = await tx
        .select({ pausedAt: eventPauses.pausedAt, resumedAt: eventPauses.resumedAt })
        .from(eventPauses)
        .where(
          and(eq(eventPauses.eventId, event.id), gte(eventPauses.pausedAt, event.huntStartedAt))
        );
      const pausedMs = pauses.reduce(
        (sum, p) => sum + ((p.resumedAt ?? now).getTime() - p.pausedAt.getTime()),
        0
      );
      const deadline =
        event.huntStartedAt.getTime() + event.huntDurationMinutes * 60_000 + pausedMs;
      if (now.getTime() > deadline) return reply(403, "Time's up! The hunt has ended.");

      const [qr] = await tx
        .select()
        .from(qrCodes)
        .where(and(eq(qrCodes.qrToken, token), eq(qrCodes.eventId, team.eventId)))
        .limit(1);
      if (!qr) return reply(400, NOT_YOUR_CHECKPOINT);

      if (qr.isFake) {
        await tx.insert(fakeQrScans).values({
          organizationId: team.organizationId,
          eventId: team.eventId,
          qrCodeId: qr.id,
          teamId: team.id,
          playerId: auth.id,
        });
        return {
          status: 200,
          body: {
            success: false,
            isFake: true,
            message: "Decoy checkpoint! You scanned a decoy QR code!",
            redirect_url: qr.redirectUrl,
            fake_label: qr.fakeLabel,
          },
        };
      }

      const [expected] = await tx
        .select()
        .from(teamClueOrder)
        .where(and(eq(teamClueOrder.teamId, team.id), eq(teamClueOrder.stepIndex, team.currentStep)))
        .limit(1);
      if (!expected) {
        return reply(400, "All clues have already been completed for your team!");
      }
      if (qr.clueId !== expected.clueId) return reply(400, NOT_YOUR_CHECKPOINT);

      const [{ totalClues }] = await tx
        .select({ totalClues: count() })
        .from(clues)
        .where(eq(clues.eventId, team.eventId));

      const points = expected.hintViewed ? 5 : 10;
      const nextStep = team.currentStep + 1;
      const complete = nextStep >= totalClues;
      const newScore = team.score + points;

      await tx.insert(scans).values({
        organizationId: team.organizationId,
        eventId: team.eventId,
        teamId: team.id,
        clueId: expected.clueId,
        qrCodeId: qr.id,
        scannedBy: auth.id,
        hintWasUsed: expected.hintViewed,
        pointsAwarded: points,
      });
      await tx
        .update(teams)
        .set({ score: newScore, currentStep: nextStep, ...(complete && { huntFinishedAt: now }) })
        .where(eq(teams.id, team.id));

      return {
        status: 200,
        body: {
          success: true,
          message: complete
            ? "Victory! Your team has solved all clues and finished the hunt!"
            : `Checkpoint verified! +${points} points${expected.hintViewed ? " (hint used)" : ""}. Move to the next clue!`,
          pointsEarned: points,
          newScore,
          nextStep,
          isComplete: complete,
          hintUsed: expected.hintViewed,
        },
      };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { success: false, message: "Your team has already verified this clue!" },
        { status: 400 }
      );
    }
    console.error("Scan route error:", error);
    return NextResponse.json(
      { success: false, message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
