import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { qrCodes } from "@/db/schema";
import { generateQRToken } from "@/lib/utils/helpers";

export async function GET(request: NextRequest) {
  try {
    const clueId = request.nextUrl.searchParams.get("clue_id");
    if (!clueId) return NextResponse.json({ success: false, message: "Clue ID is required" }, { status: 400 });
    const [existing] = await db.select({ qrToken: qrCodes.qrToken }).from(qrCodes).where(eq(qrCodes.clueId, clueId)).limit(1);
    return NextResponse.json({
      success: true,
      token: existing?.qrToken ?? generateQRToken(),
      exists: !!existing,
      message: existing ? undefined : "Preview token generated (not saved to database)",
    });
  } catch (error) {
    console.error("QR token error:", error);
    return NextResponse.json({ success: false, message: "An error occurred" }, { status: 500 });
  }
}
