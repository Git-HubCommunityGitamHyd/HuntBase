import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, eventPauses } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireAdminSession, handleAuthError } from "@/lib/auth/guards";

// POST - Pause or Resume an active hunt
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const { event_id, action } = body;

        if (!event_id) {
            return NextResponse.json(
                { success: false, message: "event_id is required" },
                { status: 400 }
            );
        }

        // 1. Session Auth: Verify admin privileges and organization ownership
        try {
            await requireAdminSession(request, event_id);
        } catch (authErr) {
            const authResponse = handleAuthError(authErr);
            if (authResponse) return authResponse;
            throw authErr;
        }

        // 2. Atomic Transaction: Update hunt status & manage event_pauses record
        const result = await db.transaction(async (tx) => {
            const [event] = await tx
                .select()
                .from(events)
                .where(eq(events.id, event_id));

            if (!event) {
                return { status: 404, data: { success: false, message: "Event not found" } };
            }

            if (!event.huntStartedAt) {
                return {
                    status: 400,
                    data: { success: false, message: "Cannot pause a hunt that has not been started yet" }
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
                // Check if an open pause already exists
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
                }
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
