import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";

export async function POST(request: NextRequest) {
  try {
    const { event_id } = await request.json();
    if (!event_id) return NextResponse.json({ success: false, message: "Event ID is required" }, { status: 400 });
    await db.update(events).set({ huntStartedAt: null, huntStatus: "paused" }).where(eq(events.id, event_id));
    return NextResponse.json({ success: true, message: "Hunt stopped successfully!" });
  } catch (error) {
    console.error("Stop hunt error:", error);
    return NextResponse.json({ success: false, message: "Failed to stop hunt" }, { status: 500 });
  }
}
