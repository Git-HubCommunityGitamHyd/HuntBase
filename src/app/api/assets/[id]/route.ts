import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizationAssets } from "@/db/schema";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [asset] = await db.select({ contentType: organizationAssets.contentType, data: organizationAssets.data })
      .from(organizationAssets).where(eq(organizationAssets.id, id)).limit(1);
    if (!asset) return NextResponse.json({ success: false, message: "Asset not found" }, { status: 404 });
    return new Response(new Uint8Array(asset.data), {
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Asset fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch asset" }, { status: 500 });
  }
}
