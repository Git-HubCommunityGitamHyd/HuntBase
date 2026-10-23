import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const organizationId = formData.get("organization_id") as string | null;
        const assetType = (formData.get("asset_type") as string) || "logo"; // "logo" | "banner"

        if (!file || !organizationId) {
            return NextResponse.json(
                { success: false, message: "File and organization_id are required" },
                { status: 400 }
            );
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json(
                { success: false, message: "File size exceeds 5MB limit" },
                { status: 400 }
            );
        }

        // Validate mime type
        const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { success: false, message: "Invalid image format. Allowed: PNG, JPEG, WebP, SVG." },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // Convert file to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Compute clean path
        const fileExt = file.name.split(".").pop() || "png";
        const fileName = `${organizationId}/${assetType}_${Date.now()}.${fileExt}`;

        // Upload to Supabase Storage bucket 'organization-assets' (with upsert)
        const { error: uploadError } = await supabase.storage
            .from("organization-assets")
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true,
            });

        if (uploadError) {
            console.error("Storage upload error:", uploadError);
            return NextResponse.json(
                { success: false, message: `Upload failed: ${uploadError.message}` },
                { status: 500 }
            );
        }

        // Retrieve public URL
        const { data: urlData } = supabase.storage
            .from("organization-assets")
            .getPublicUrl(fileName);

        const publicUrl = urlData.publicUrl;

        // Auto-update organization record or theme config
        if (assetType === "logo") {
            await supabase
                .from("organizations")
                .update({ logo_url: publicUrl })
                .eq("id", organizationId);
        } else if (assetType === "banner") {
            await supabase
                .from("organizations")
                .update({ banner_url: publicUrl })
                .eq("id", organizationId);

            await supabase
                .from("theme_configs")
                .update({ banner_url: publicUrl })
                .eq("organization_id", organizationId);
        }

        return NextResponse.json({
            success: true,
            message: `${assetType} uploaded successfully`,
            publicUrl,
        });
    } catch (error) {
        console.error("Asset upload handler error:", error);
        return NextResponse.json(
            { success: false, message: "An unexpected error occurred during upload" },
            { status: 500 }
        );
    }
}
