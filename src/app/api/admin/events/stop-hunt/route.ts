import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, eventPauses } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";

// POST - Conclude / Stop the hunt for an event
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

            // High-priority Issue 5: Idempotency check if already completed
            if (event.huntStatus === "completed") {
                return {
                    status: 200,
                    data: {
                        success: true,
                        message: "Hunt is already completed.",
                        event_id,
                        hunt_started_at: event.huntStartedAt?.toISOString() ?? null,
                        hunt_ended_at: event.huntEndedAt?.toISOString() ?? null,
                    },
                };
            }

            // High-priority Issue 1 & 5: Only allow stopping from active or paused states
            if (event.huntStatus !== "active" && event.huntStatus !== "paused") {
                return {
                    status: 400,
                    data: {
                        success: false,
                        message: `Cannot stop hunt: event status is currently '${event.huntStatus}'. Only 'active' or 'paused' hunts can be stopped.`,
                    },
                };
            }

            const now = new Date();

            // Close any open pause record
            await tx
                .update(eventPauses)
                .set({ resumedAt: now })
                .where(and(eq(eventPauses.eventId, event_id), isNull(eventPauses.resumedAt)));

            // High-priority Issue 5: Mark hunt as completed with hunt_ended_at; NEVER CLEAR hunt_started_at
            await tx
                .update(events)
                .set({
                    huntStatus: "completed",
                    huntEndedAt: now,
                    isActive: false,
                })
                .where(eq(events.id, event_id));

            return {
                status: 200,
                data: {
                    success: true,
                    message: "Hunt concluded successfully. Scores and final leaderboard are frozen.",
                    event_id,
                    hunt_started_at: event.huntStartedAt?.toISOString() ?? null,
                    hunt_ended_at: now.toISOString(),
                },
            };
        });

        return NextResponse.json(result.data, { status: result.status });
    } catch (error) {
        console.error("Stop hunt error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to stop hunt" },
            { status: 500 }
        );
    }
}
