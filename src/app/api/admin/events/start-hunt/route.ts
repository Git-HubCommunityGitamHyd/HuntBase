import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events, teamClueOrder, teams } from "@/db/schema";

function shuffle<T>(items: T[]) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export async function POST(request: NextRequest) {
  try {
    const { event_id } = await request.json();
    if (!event_id) return NextResponse.json({ success: false, message: "Event ID is required" }, { status: 400 });
    const result = await db.transaction(async (tx) => {
      const [event] = await tx.select().from(events).where(eq(events.id, event_id)).limit(1);
      if (!event) return { error: "Event not found", status: 404 };
      if (!event.isActive) return { error: "Event must be active to start the hunt", status: 400 };
      const clueRows = await tx.select({ id: clues.id }).from(clues).where(eq(clues.eventId, event_id)).orderBy(asc(clues.stepNumber));
      if (!clueRows.length) return { error: "No clues found for this event. Add clues first!", status: 400 };
      const teamRows = await tx.select({ id: teams.id }).from(teams).where(eq(teams.eventId, event_id)).orderBy(asc(teams.createdAt));
      for (let i = 0; i < teamRows.length; i++) {
        const offset = i % clueRows.length;
        const rotated = [...clueRows.slice(offset), ...clueRows.slice(0, offset)];
        const order = [rotated[0], ...shuffle(rotated.slice(1))];
        await tx.delete(teamClueOrder).where(eq(teamClueOrder.teamId, teamRows[i].id));
        await tx.insert(teamClueOrder).values(order.map((c, stepIndex) => ({ teamId: teamRows[i].id, clueId: c.id, stepIndex })));
      }
      if (teamRows.length) await tx.update(teams).set({ currentStep: 0, score: 0, huntFinishedAt: null }).where(eq(teams.eventId, event_id));
      await tx.update(events).set({ huntStartedAt: new Date(), huntStatus: "active" }).where(eq(events.id, event_id));
      return { teamCount: teamRows.length, clueCount: clueRows.length };
    });
    if ("error" in result) return NextResponse.json({ success: false, message: result.error }, { status: result.status });
    return NextResponse.json({ success: true, message: `Hunt started! ${result.teamCount} teams are ready with ${result.clueCount} clues each.` });
  } catch (error) {
    console.error("Start hunt error:", error);
    return NextResponse.json({ success: false, message: "Failed to start hunt" }, { status: 500 });
  }
}
