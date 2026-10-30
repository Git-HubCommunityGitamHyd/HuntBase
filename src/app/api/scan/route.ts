import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teams, events, clues, qrCodes, teamClueOrder, scans, fakeQrScans } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { requirePlayerSession, handleAuthError } from "@/lib/auth/guards";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { token } = body;

        if (!token) {
            return NextResponse.json(
                { success: false, message: "QR token is required" },
                { status: 400 }
            );
        }

        // 1. Session Auth: Verify caller is an authenticated player belonging to this team
        let playerAuth;
        try {
            playerAuth = requirePlayerSession(request, body.team_id);
        } catch (authErr) {
            const authResponse = handleAuthError(authErr);
            if (authResponse) return authResponse;
            throw authErr;
        }

        const { playerId, teamId } = playerAuth;
        const cleanToken = token.trim();

        // 2. Atomic PostgreSQL Transaction with Row-Level Lock
        const result = await db.transaction(async (tx) => {
            // Lock the team record to prevent concurrent scan race conditions
            const [team] = await tx
                .select()
                .from(teams)
                .where(eq(teams.id, teamId))
                .for("update");

            if (!team) {
                return { status: 404, data: { success: false, message: "Team not found" } };
            }

            if (team.isDisqualified) {
                return { status: 403, data: { success: false, message: "Your team has been disqualified" } };
            }

            if (team.huntFinishedAt) {
                return {
                    status: 400,
                    data: { success: false, message: "Your team has already solved all clues and completed the hunt!" }
                };
            }

            // Verify event status
            const [event] = await tx
                .select()
                .from(events)
                .where(eq(events.id, team.eventId));

            if (!event || !event.isActive) {
                return { status: 403, data: { success: false, message: "This event is not currently active" } };
            }

            if (!event.huntStartedAt || event.huntStatus !== "active") {
                const message = event.huntStatus === "paused"
                    ? "The hunt is currently paused by organizers."
                    : "The hunt has not been started yet. Wait for the organizers!";
                return { status: 403, data: { success: false, message } };
            }

            // Check timer expiration
            const huntStartTime = new Date(event.huntStartedAt).getTime();
            const huntDurationMs = (event.huntDurationMinutes || 60) * 60 * 1000;
            const now = Date.now();

            if (now > huntStartTime + huntDurationMs) {
                return { status: 403, data: { success: false, message: "Time's up! The hunt has ended." } };
            }

            // Look up QR code
            const [qrCode] = await tx
                .select()
                .from(qrCodes)
                .where(and(eq(qrCodes.qrToken, cleanToken), eq(qrCodes.eventId, team.eventId)));

            if (!qrCode) {
                return { status: 400, data: { success: false, message: "Invalid checkpoint QR code for this event" } };
            }

            // Handle decoy prank / rickroll QR codes
            if (qrCode.isFake) {
                await tx.insert(fakeQrScans).values({
                    organizationId: team.organizationId,
                    eventId: team.eventId,
                    qrCodeId: qrCode.id,
                    teamId: team.id,
                    playerId,
                });

                return {
                    status: 200,
                    data: {
                        success: false,
                        isFake: true,
                        message: "😈 Decoy Checkpoint! You scanned a decoy QR code!",
                        redirect_url: qrCode.redirectUrl,
                        fake_label: qrCode.fakeLabel,
                    }
                };
            }

            // Check expected clue from team_clue_order
            const [expectedClueOrder] = await tx
                .select()
                .from(teamClueOrder)
                .where(and(
                    eq(teamClueOrder.teamId, team.id),
                    eq(teamClueOrder.stepIndex, team.currentStep)
                ));

            if (!expectedClueOrder) {
                return { status: 400, data: { success: false, message: "All clues have already been completed for your team!" } };
            }

            if (qrCode.clueId !== expectedClueOrder.clueId) {
                return {
                    status: 400,
                    data: { success: false, message: "Wrong checkpoint! This is not your team's assigned next clue." }
                };
            }

            // Duplicate scan check
            const [existingScan] = await tx
                .select({ id: scans.id })
                .from(scans)
                .where(and(
                    eq(scans.teamId, team.id),
                    eq(scans.clueId, qrCode.clueId!)
                ));

            if (existingScan) {
                return { status: 400, data: { success: false, message: "Your team has already verified this clue!" } };
            }

            // Compute score delta
            const hintUsed = expectedClueOrder.hintViewed;
            const pointsEarned = hintUsed ? 5 : 10;

            // Insert verified scan
            await tx.insert(scans).values({
                organizationId: team.organizationId,
                eventId: team.eventId,
                teamId: team.id,
                clueId: qrCode.clueId!,
                qrCodeId: qrCode.id,
                scannedBy: playerId,
                hintWasUsed: hintUsed,
                pointsAwarded: pointsEarned,
            });

            // Count total clues to evaluate finish state
            const [{ totalClues }] = await tx
                .select({ totalClues: count() })
                .from(clues)
                .where(eq(clues.eventId, team.eventId));

            const newScore = team.score + pointsEarned;
            const newStep = team.currentStep + 1;
            const isComplete = newStep >= totalClues;
            const finishTimestamp = isComplete ? new Date() : null;

            // Atomically update team score and progress
            await tx
                .update(teams)
                .set({
                    score: newScore,
                    currentStep: newStep,
                    huntFinishedAt: finishTimestamp ?? team.huntFinishedAt,
                })
                .where(eq(teams.id, team.id));

            const message = isComplete
                ? "🎉 Victory! Your team has solved all clues and finished the hunt!"
                : `Checkpoint Verified! +${pointsEarned} points${hintUsed ? " (hint used)" : ""}. Move to the next clue!`;

            return {
                status: 200,
                data: {
                    success: true,
                    message,
                    newScore,
                    nextStep: newStep,
                    isComplete,
                    pointsEarned,
                    hintUsed,
                }
            };
        });

        return NextResponse.json(result.data, { status: result.status });
    } catch (error) {
        console.error("Scan route error:", error);
        return NextResponse.json(
            { success: false, message: "An unexpected error occurred processing your scan" },
            { status: 500 }
        );
    }
}
