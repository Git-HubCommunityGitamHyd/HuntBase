import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, eventPauses } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";

// POST - Pause or Resume an active hunt
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (auth instanceof NextResponse) return auth;

        const body = await request.json().catch(() => ({}));
        const { event_id, action } = body;

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

            if (event.huntStatus !== "active" && event.huntStatus !== "paused") {
                return {
                    status: 400,
                    data: {
                        success: false,
                        message: `Cannot pause/resume hunt in '${event.huntStatus}' status. Hunt must be 'active' or 'paused'.`,
                    },
                };
            }

            let newStatus: "active" | "paused";
            if (action === "pause") {
                newStatus = "paused";
            } else if (action === "resume") {
                newStatus = "active";
            } else {
                newStatus = event.huntStatus === "paused" ? "active" : "paused";
            }

            const now = new Date();

            if (newStatus === "paused") {
                // Check if an open pause already exists (one open pause per event)
                const [openPause] = await tx
                    .select()
                    .from(eventPauses)
                    .where(and(eq(eventPauses.eventId, event_id), isNull(eventPauses.resumedAt)))
                    .limit(1);

                if (!openPause) {
                    await tx.insert(eventPauses).values({
                        eventId: event_id,
                        pausedAt: now,
                    });
                }
            } else {
                // Resuming: close any open pause record
                await tx
                    .update(eventPauses)
                    .set({ resumedAt: now })
                    .where(and(eq(eventPauses.eventId, event_id), isNull(eventPauses.resumedAt)));
            }

            // Update event status
            await tx
                .update(events)
                .set({ huntStatus: newStatus })
                .where(eq(events.id, event_id));

            const message = newStatus === "paused"
                ? "Hunt paused. Checkpoint scans and hint unlocks are temporarily suspended."
                : "Hunt resumed. Gameplay is active.";

            return {
                status: 200,
                data: {
                    success: true,
                    message,
                    hunt_status: newStatus,
                },
            };
        });

        return NextResponse.json(result.data, { status: result.status });
    } catch (error) {
        console.error("Pause hunt error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to update hunt pause state" },
            { status: 500 }
        );
    }
}
