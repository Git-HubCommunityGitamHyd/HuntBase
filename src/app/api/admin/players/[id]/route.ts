import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ success: false, message: "Player ID required" }, { status: 400 });
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Player delete error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete player" }, { status: 500 });
  }
}
