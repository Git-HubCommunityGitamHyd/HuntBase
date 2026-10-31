import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizationAssets, organizations, themeConfigs } from "@/db/schema";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const organizationId = formData.get("organization_id");
    const assetType = formData.get("asset_type") || "logo";
    if (!(file instanceof File) || typeof organizationId !== "string") {
      return NextResponse.json({ success: false, message: "File and organization_id are required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ success: false, message: "File size exceeds 5MB limit" }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ success: false, message: "Invalid image format. Allowed: PNG, JPEG, WebP, SVG." }, { status: 400 });
    if (assetType !== "logo" && assetType !== "banner") return NextResponse.json({ success: false, message: "asset_type must be logo or banner" }, { status: 400 });

    const [asset] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(organizationAssets).values({
        organizationId,
        assetType,
        contentType: file.type,
        data: Buffer.from(await file.arrayBuffer()),
      }).returning({ id: organizationAssets.id });
      const publicUrl = `/api/assets/${created.id}`;
      if (assetType === "logo") await tx.update(organizations).set({ logoUrl: publicUrl }).where(eq(organizations.id, organizationId));
      else {
        await tx.update(organizations).set({ bannerUrl: publicUrl }).where(eq(organizations.id, organizationId));
        await tx.update(themeConfigs).set({ bannerUrl: publicUrl }).where(eq(themeConfigs.organizationId, organizationId));
      }
      return [created];
    });

    return NextResponse.json({ success: true, message: `${assetType} uploaded successfully`, publicUrl: `/api/assets/${asset.id}` });
  } catch (error) {
    console.error("Asset upload handler error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred during upload" }, { status: 500 });
  }
}
