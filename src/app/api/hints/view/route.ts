import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events, teamClueOrder, teams } from "@/db/schema";

export async function POST(request: NextRequest) {
  try {
    const { team_id, clue_id, player_id } = await request.json();
    if (!team_id || !clue_id) return NextResponse.json({ success: false, message: "Team ID and Clue ID are required" }, { status: 400 });
    const [team] = await db.select({ id: teams.id, disqualified: teams.isDisqualified, event: events })
      .from(teams).innerJoin(events, eq(events.id, teams.eventId)).where(eq(teams.id, team_id)).limit(1);
    if (!team) return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });
    if (team.disqualified) return NextResponse.json({ success: false, message: "Team is disqualified" }, { status: 403 });
    if (!team.event.huntStartedAt || !team.event.isActive) return NextResponse.json({ success: false, message: "Hunt has not started" }, { status: 403 });
    const [order] = await db.select().from(teamClueOrder).where(and(eq(teamClueOrder.teamId, team_id), eq(teamClueOrder.clueId, clue_id))).limit(1);
    if (!order) return NextResponse.json({ success: false, message: "Clue order not found" }, { status: 404 });
    if (order.hintViewed) return NextResponse.json({ success: true, message: "Hint already viewed", already_viewed: true });
    const delay = team.event.hintDelayMinutes;
    const elapsed = order.clueStartedAt ? (Date.now() - order.clueStartedAt.getTime()) / 60000 : 0;
    if (elapsed < delay) return NextResponse.json({ success: false, message: `Hint not available yet. Wait ${Math.ceil(delay - elapsed)} more minutes.` }, { status: 400 });
    await db.update(teamClueOrder).set({ hintViewed: true, hintViewedAt: new Date(), hintViewedBy: player_id || null }).where(eq(teamClueOrder.id, order.id));
    const [clue] = await db.select({ hintText: clues.hintText }).from(clues).where(eq(clues.id, clue_id)).limit(1);
    return NextResponse.json({ success: true, message: "Hint viewed! Points for this clue reduced to +5", hint_text: clue?.hintText ?? null });
  } catch (error) {
    console.error("View hint error:", error);
    return NextResponse.json({ success: false, message: "Failed to view hint" }, { status: 500 });
  }
}
