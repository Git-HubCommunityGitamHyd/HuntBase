import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues } from "@/db/schema";

const asApiClue = (row: typeof clues.$inferSelect) => ({
  id: row.id,
  event_id: row.eventId,
  step_number: row.stepNumber,
  clue_text: row.clueText,
  hint_text: row.hintText,
  location_name: row.locationName,
  admin_notes: row.adminNotes,
  created_at: row.createdAt.toISOString(),
});

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("event_id");
    const rows = await db
      .select()
      .from(clues)
      .where(eventId ? eq(clues.eventId, eventId) : undefined)
      .orderBy(asc(clues.stepNumber));
    return NextResponse.json({ success: true, data: rows.map(asApiClue) });
  } catch (error) {
    console.error("Clues fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch clues" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event_id, step_number, clue_text, location_name, hint_text, admin_notes } = body;
    if (!event_id || !step_number || !clue_text) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }
    const [row] = await db.insert(clues).values({
      eventId: event_id,
      stepNumber: Number(step_number),
      clueText: clue_text,
      locationName: location_name || null,
      hintText: hint_text || null,
      adminNotes: admin_notes || null,
    }).returning();
    return NextResponse.json({ success: true, data: asApiClue(row) });
  } catch (error) {
    console.error("Clue creation error:", error);
    return NextResponse.json({ success: false, message: "Failed to create clue" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, event_id, step_number, clue_text, location_name, hint_text, admin_notes } = body;
    if (!id) return NextResponse.json({ success: false, message: "Clue ID required" }, { status: 400 });
    await db.update(clues).set({
      ...(event_id !== undefined && { eventId: event_id }),
      ...(step_number !== undefined && { stepNumber: Number(step_number) }),
      ...(clue_text !== undefined && { clueText: clue_text }),
      ...(location_name !== undefined && { locationName: location_name || null }),
      ...(hint_text !== undefined && { hintText: hint_text || null }),
      ...(admin_notes !== undefined && { adminNotes: admin_notes || null }),
    }).where(eq(clues.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Clue update error:", error);
    return NextResponse.json({ success: false, message: "Failed to update clue" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "Clue ID required" }, { status: 400 });
    await db.delete(clues).where(eq(clues.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Clue delete error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete clue" }, { status: 500 });
  }
}
