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
import { isUniqueViolation } from "@/lib/db-errors";
import { validateHuntActiveState } from "@/lib/gameplay/hunt-lifecycle";

// One message for "unknown code" and "real code, wrong clue", so codes can't be probed.
const NOT_YOUR_CHECKPOINT =
  "That's not the checkpoint for your current clue. Re-read your clue and try again.";

type Outcome = { status: number; body: Record<string, unknown> };
const reply = (status: number, message: string, extra: Record<string, unknown> = {}): Outcome => ({
  status,
  body: { success: false, message, ...extra },
});

export async function POST(request: NextRequest) {
  try {
    // Critical Issue 1: Team and player come from the verified session.
    const auth = await requireVerifiedPlayer(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => null);

    // Reject forged / mismatched client-supplied identity fields
    if (body) {
      if (body.team_id && body.team_id !== auth.teamId) {
        return NextResponse.json({ success: false, message: "Forbidden: Mismatched team identity" }, { status: 403 });
      }
      if (body.teamId && body.teamId !== auth.teamId) {
        return NextResponse.json({ success: false, message: "Forbidden: Mismatched team identity" }, { status: 403 });
      }
      if (body.player_id && body.player_id !== auth.id) {
        return NextResponse.json({ success: false, message: "Forbidden: Mismatched player identity" }, { status: 403 });
      }
      if (body.playerId && body.playerId !== auth.id) {
        return NextResponse.json({ success: false, message: "Forbidden: Mismatched player identity" }, { status: 403 });
      }
      if (body.organization_id && body.organization_id !== auth.organizationId) {
        return NextResponse.json({ success: false, message: "Forbidden: Mismatched organization identity" }, { status: 403 });
      }
      if (body.organizationId && body.organizationId !== auth.organizationId) {
        return NextResponse.json({ success: false, message: "Forbidden: Mismatched organization identity" }, { status: 403 });
      }
    }

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

      // Time spent paused does not count against the hunt.
      const pauses = await tx
        .select({ pausedAt: eventPauses.pausedAt, resumedAt: eventPauses.resumedAt })
        .from(eventPauses)
        .where(
          and(eq(eventPauses.eventId, event.id), gte(eventPauses.pausedAt, event.huntStartedAt ?? new Date(0)))
        );

      // Centralized lifecycle validation (checks active, paused, completed, and pause-adjusted duration)
      const validation = validateHuntActiveState(event, pauses, now);
      if (!validation.allowed) {
        return reply(validation.status, validation.message);
      }

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
            success: true,
            is_fake: true,
            redirect_url: qr.redirectUrl,
            message: "Decoy QR code scanned!",
          },
        };
      }

      if (!qr.clueId) return reply(400, NOT_YOUR_CHECKPOINT);

      // Fetch the clue this team is currently on.
      const [order] = await tx
        .select()
        .from(teamClueOrder)
        .where(
          and(
            eq(teamClueOrder.teamId, team.id),
            eq(teamClueOrder.stepIndex, team.currentStep)
          )
        )
        .limit(1);
      if (!order) return reply(400, NOT_YOUR_CHECKPOINT);

      // Scanned the wrong clue: don't reveal which one it was.
      if (order.clueId !== qr.clueId) return reply(400, NOT_YOUR_CHECKPOINT);

      const [clue] = await tx
        .select({ id: clues.id })
        .from(clues)
        .where(eq(clues.id, order.clueId))
        .limit(1);
      if (!clue) return reply(404, "Clue not found");

      // Points: standard 10 pts, deduct 5 pts penalty if hint was used. Floor at 0.
      const basePoints = 10;
      const hintPenalty = 5;
      const rawPoints = basePoints - (order.hintViewed ? hintPenalty : 0);
      const pointsAwarded = Math.max(0, rawPoints);

      // Record the successful scan.
      try {
        await tx.insert(scans).values({
          organizationId: team.organizationId,
          eventId: team.eventId,
          teamId: team.id,
          clueId: clue.id,
          qrCodeId: qr.id,
          scannedBy: auth.id,
          hintWasUsed: order.hintViewed,
          pointsAwarded,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return reply(400, "Checkpoint already scanned");
        }
        throw err;
      }

      // Count total clues for this event
      const [{ totalClues }] = await tx
        .select({ totalClues: count() })
        .from(clues)
        .where(eq(clues.eventId, event.id));

      const nextStep = team.currentStep + 1;
      const isComplete = nextStep >= totalClues;

      await tx
        .update(teams)
        .set({
          score: team.score + pointsAwarded,
          currentStep: nextStep,
          huntFinishedAt: isComplete ? now : null,
        })
        .where(eq(teams.id, team.id));

      return {
        status: 200,
        body: {
          success: true,
          points_awarded: pointsAwarded,
          new_score: team.score + pointsAwarded,
          is_complete: isComplete,
          next_step: nextStep,
          total_clues: totalClues,
          message: isComplete
            ? "Congratulations! You completed the hunt!"
            : "Clue solved! Proceed to next clue.",
        },
      };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("Scan processing error:", error);
    return NextResponse.json(
      { success: false, message: "An error occurred while processing scan" },
      { status: 500 }
    );
  }
}
