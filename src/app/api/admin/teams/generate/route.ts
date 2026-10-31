import { asc, count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events, teamClueOrder, teamMembers, teams } from "@/db/schema";
import { generatePassword, generateUsername, hashPassword, shuffleArray } from "@/lib/utils/helpers";

export async function POST(request: NextRequest) {
  try {
    const { event_id, count: teamCount, prefix } = await request.json();
    if (!event_id || !teamCount) return NextResponse.json({ success: false, message: "Event ID and count are required" }, { status: 400 });
    if (!Number.isInteger(teamCount) || teamCount < 1 || teamCount > 100) return NextResponse.json({ success: false, message: "Count must be between 1 and 100" }, { status: 400 });
    const result = await db.transaction(async (tx) => {
      const [event] = await tx.select().from(events).where(eq(events.id, event_id)).limit(1);
      if (!event) return { error: "Event not found", status: 404 };
      const clueRows = await tx.select({ id: clues.id }).from(clues).where(eq(clues.eventId, event_id)).orderBy(asc(clues.stepNumber));
      if (!clueRows.length) return { error: "No clues found for this event. Add clues first.", status: 400 };
      const [{ existingCount }] = await tx.select({ existingCount: count() }).from(teams).where(eq(teams.eventId, event_id));
      const credentials = [];
      for (let i = 0; i < teamCount; i++) {
        const teamNumber = existingCount + i + 1;
        const teamName = `Team ${teamNumber}`;
        const username = generateUsername(prefix || event.name.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, ""), teamNumber).toLowerCase();
        const password = generatePassword(10);
        const [team] = await tx.insert(teams).values({ organizationId: event.organizationId, eventId: event.id, teamName }).returning({ id: teams.id });
        await tx.insert(teamMembers).values({ teamId: team.id, playerName: `${teamName} Captain`, username, passwordHash: await hashPassword(password) });
        await tx.insert(teamClueOrder).values(shuffleArray(clueRows).map((clue, stepIndex) => ({ teamId: team.id, clueId: clue.id, stepIndex })));
        credentials.push({ team_name: teamName, username, password });
      }
      return { credentials };
    });
    if ("error" in result) return NextResponse.json({ success: false, message: result.error }, { status: result.status });
    return NextResponse.json({ success: true, message: `Successfully created ${teamCount} teams`, credentials: result.credentials });
  } catch (error) {
    console.error("Team generation error:", error);
    return NextResponse.json({ success: false, message: "An error occurred" }, { status: 500 });
  }
}
