import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, teams, clues, teamClueOrder, scans, fakeQrScans } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { generateRoundRobinClueOrders } from "@/lib/gameplay/clue-order";
import { requireAdmin } from "@/lib/auth/session";

// POST - Start the hunt for an event (Atomic Transaction)
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const body = await request.json().catch(() => ({}));
        const { event_id } = body;

        if (!event_id) {
            return NextResponse.json(
                { success: false, message: "event_id is required" },
                { status: 400 }
            );
        }

        const result = await db.transaction(async (tx) => {
            const [event] = await tx
                .select()
                .from(events)
                .where(eq(events.id, event_id))
                .limit(1)
                .for("update");

            if (!event) {
                return { status: 404, data: { success: false, message: "Event not found" } };
            }

            // Check organization permission (super_admin can bypass)
            if (auth.role !== "super_admin" && auth.organizationId !== event.organizationId) {
                return {
                    status: 403,
                    data: { success: false, message: "Forbidden: You do not have permission to manage this event" },
                };
            }

            // Only allow starting from draft or scheduled status to protect live hunts
            if (event.huntStatus !== "draft" && event.huntStatus !== "scheduled") {
                return {
                    status: 400,
                    data: {
                        success: false,
                        message: `Cannot start hunt: event status is currently '${event.huntStatus}'. Only 'draft' or 'scheduled' hunts can be started.`,
                    },
                };
            }

            // Fetch competing teams for this event
            const competingTeams = await tx
                .select({ id: teams.id, teamName: teams.teamName })
                .from(teams)
                .where(eq(teams.eventId, event_id))
                .orderBy(asc(teams.createdAt));

            // Fetch clues for this event
            const eventClues = await tx
                .select({ id: clues.id, stepNumber: clues.stepNumber })
                .from(clues)
                .where(eq(clues.eventId, event_id))
                .orderBy(asc(clues.stepNumber));

            if (!eventClues || eventClues.length === 0) {
                return {
                    status: 400,
                    data: { success: false, message: "No clues found for this event. Please add clues first!" },
                };
            }

            if (competingTeams.length > 0) {
                const teamIds = competingTeams.map((t) => t.id);
                const clueIds = eventClues.map((c) => c.id);

                // Purge prior orders and scans atomically
                await tx
                    .delete(teamClueOrder)
                    .where(inArray(teamClueOrder.teamId, teamIds));

                await tx
                    .delete(scans)
                    .where(inArray(scans.teamId, teamIds));

                await tx
                    .delete(fakeQrScans)
                    .where(inArray(fakeQrScans.teamId, teamIds));

                // Generate and insert round-robin clue sequence
                const clueAssignments = generateRoundRobinClueOrders(teamIds, clueIds);

                if (clueAssignments.length > 0) {
                    await tx.insert(teamClueOrder).values(
                        clueAssignments.map((a) => ({
                            teamId: a.team_id,
                            clueId: a.clue_id,
                            stepIndex: a.step_index,
                        }))
                    );
                }

                // Reset all competing teams
                await tx
                    .update(teams)
                    .set({
                        score: 0,
                        currentStep: 0,
                        huntFinishedAt: null,
                    })
                    .where(inArray(teams.id, teamIds));
            }

            // Update event status
            const now = new Date();
            await tx
                .update(events)
                .set({
                    isActive: true,
                    huntStatus: "active",
                    huntStartedAt: now,
                    huntEndedAt: null,
                })
                .where(eq(events.id, event_id));

            return {
                status: 200,
                data: {
                    success: true,
                    message: `Hunt started! ${competingTeams.length} teams deployed across ${eventClues.length} clue checkpoints.`,
                    teamsCount: competingTeams.length,
                    cluesCount: eventClues.length,
                },
            };
        });

        return NextResponse.json(result.data, { status: result.status });
    } catch (error) {
        console.error("Start hunt error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to start hunt" },
            { status: 500 }
        );
    }
}
