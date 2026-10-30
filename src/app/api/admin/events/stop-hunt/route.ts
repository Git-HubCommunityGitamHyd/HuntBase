import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, eventPauses } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireAdminSession, handleAuthError } from "@/lib/auth/guards";

// POST - Conclude / Stop the hunt for an event
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const { event_id } = body;

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

        // 2. Atomic Transaction: Conclude hunt & close any open pause
        const result = await db.transaction(async (tx) => {
            const [event] = await tx
                .select()
                .from(events)
                .where(eq(events.id, event_id));

            if (!event) {
                return { status: 404, data: { success: false, message: "Event not found" } };
            }

            const now = new Date();

            // Close any open pause record
            await tx
                .update(eventPauses)
                .set({ resumedAt: now })
                .where(and(eq(eventPauses.eventId, event_id), isNull(eventPauses.resumedAt)));

            // Mark hunt as completed
            await tx
                .update(events)
                .set({
                    huntStatus: "completed",
                    huntEndedAt: now,
                })
                .where(eq(events.id, event_id));

            return {
                status: 200,
                data: {
                    success: true,
                    message: "Hunt concluded successfully. Scores and final leaderboard are frozen.",
                }
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
