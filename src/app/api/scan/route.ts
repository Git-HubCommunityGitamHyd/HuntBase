import { and, count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events, eventPauses, fakeQrScans, qrCodes, scans, teamClueOrder, teams } from "@/db/schema";
import { requireVerifiedPlayer } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db-errors";

export async function POST(request: NextRequest) {
    try {
        const auth = await requireVerifiedPlayer(request);
        if (auth instanceof NextResponse) return auth;

        const body = await request.json().catch(() => ({}));
        const { token } = body;

        if (!token) {
            return NextResponse.json(
                { success: false, message: "QR token is required" },
                { status: 400 }
            );
        }

        const teamId = auth.teamId;
        const playerId = auth.id;
        const cleanToken = String(token).trim();

        const result = await db.transaction(async (tx) => {
            // 1. Lock team record to prevent concurrent scan race conditions
            const [team] = await tx
                .select()
                .from(teams)
                .where(eq(teams.id, teamId))
                .limit(1)
                .for("update");

            if (!team) {
                return { status: 404, body: { success: false, message: "Team not found" } };
            }

            if (team.isDisqualified) {
                return { status: 403, body: { success: false, message: "Your team has been disqualified" } };
            }

            if (team.huntFinishedAt) {
                return {
                    status: 400,
                    body: { success: false, message: "Your team has already solved all clues and completed the hunt!" }
                };
            }

            // 2. Fetch event
            const [event] = await tx
                .select()
                .from(events)
                .where(eq(events.id, team.eventId))
                .limit(1);

            if (!event) {
                return { status: 404, body: { success: false, message: "Event not found" } };
            }

            const now = new Date();
            if (!event.isActive || !event.huntStartedAt || event.huntStatus !== "active") {
                const message = event.huntStatus === "paused"
                    ? "The hunt is currently paused by organizers."
                    : "The hunt is not currently active.";
                return { status: 403, body: { success: false, message } };
            }

            // Adjust elapsed time for pauses
            const pauses = await tx
                .select()
                .from(eventPauses)
                .where(eq(eventPauses.eventId, event.id));

            let totalPauseMs = 0;
            for (const p of pauses) {
                const pauseEnd = p.resumedAt ? p.resumedAt.getTime() : now.getTime();
                totalPauseMs += Math.max(0, pauseEnd - p.pausedAt.getTime());
            }

            const elapsedMs = (now.getTime() - event.huntStartedAt.getTime()) - totalPauseMs;
            const durationMs = event.huntDurationMinutes * 60000;
            if (elapsedMs > durationMs) {
                return { status: 403, body: { success: false, message: "Time's up! The hunt has ended." } };
            }

            // 3. Look up QR code
            const [qr] = await tx
                .select()
                .from(qrCodes)
                .where(and(eq(qrCodes.qrToken, cleanToken), eq(qrCodes.eventId, team.eventId)))
                .limit(1);

            if (!qr) {
                return { status: 400, body: { success: false, message: "Invalid checkpoint QR code for this event" } };
            }

            // 4. Decoy / Rickroll QR trap
            if (qr.isFake) {
                await tx.insert(fakeQrScans).values({
                    organizationId: team.organizationId,
                    eventId: team.eventId,
                    qrCodeId: qr.id,
                    teamId: team.id,
                    playerId,
                });

                return {
                    status: 200,
                    body: {
                        success: false,
                        message: "Decoy checkpoint! You scanned a decoy QR code!",
                        isFake: true,
                        redirect_url: qr.redirectUrl,
                        fake_label: qr.fakeLabel,
                    }
                };
            }

            // 5. Expected clue check from team_clue_order
            const [expected] = await tx
                .select()
                .from(teamClueOrder)
                .where(and(
                    eq(teamClueOrder.teamId, team.id),
                    eq(teamClueOrder.stepIndex, team.currentStep)
                ))
                .limit(1);

            if (!expected) {
                return { status: 400, body: { success: false, message: "All clues have already been completed for your team!" } };
            }

            if (qr.clueId !== expected.clueId) {
                return { status: 400, body: { success: false, message: "Wrong checkpoint! This is not your team's assigned next clue." } };
            }

            // 6. Insert scan & compute points
            const [{ totalClues }] = await tx
                .select({ totalClues: count() })
                .from(clues)
                .where(eq(clues.eventId, team.eventId));

            const points = expected.hintViewed ? 5 : 10;
            const nextStep = team.currentStep + 1;
            const complete = nextStep >= totalClues;

            await tx.insert(scans).values({
                organizationId: team.organizationId,
                eventId: team.eventId,
                teamId: team.id,
                clueId: expected.clueId,
                qrCodeId: qr.id,
                scannedBy: playerId,
                hintWasUsed: expected.hintViewed,
                pointsAwarded: points,
            });

            await tx
                .update(teams)
                .set({
                    score: team.score + points,
                    currentStep: nextStep,
                    ...(complete && { huntFinishedAt: now }),
                })
                .where(eq(teams.id, team.id));

            return {
                status: 200,
                body: {
                    success: true,
                    message: complete
                        ? "Victory! Your team has solved all clues and finished the hunt!"
                        : `Checkpoint verified! +${points} points${expected.hintViewed ? " (hint used)" : ""}. Move to the next clue!`,
                    newScore: team.score + points,
                    nextStep,
                    isComplete: complete,
                    pointsEarned: points,
                    hintUsed: expected.hintViewed,
                }
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
