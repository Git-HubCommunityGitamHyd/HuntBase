import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
    try {
        const session = getSession(request);
        if (!session || session.role !== "super_admin") {
            return NextResponse.json(
                { success: false, message: "Unauthorized: Super Admin access required" },
                { status: 403 }
            );
        }

        const { organization_id, is_verified } = await request.json();

        if (!organization_id || typeof is_verified !== "boolean") {
            return NextResponse.json(
                { success: false, message: "organization_id and is_verified boolean are required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // 1. Update organization verification status
        const { data: updatedOrg, error: orgError } = await supabase
            .from("organizations")
            .update({
                is_verified,
                updated_at: new Date().toISOString(),
            })
            .eq("id", organization_id)
            .select()
            .single();

        if (orgError || !updatedOrg) {
            console.error("Error updating organization verification:", orgError);
            return NextResponse.json(
                { success: false, message: "Failed to update club verification status" },
                { status: 500 }
            );
        }

        // 2. Also ensure host users are active when club is verified
        await supabase
            .from("host_users")
            .update({
                is_active: is_verified,
                updated_at: new Date().toISOString(),
            })
            .eq("organization_id", organization_id);

        return NextResponse.json({
            success: true,
            message: is_verified ? "Club approved and verified!" : "Club verification revoked.",
            organization: updatedOrg,
        });
    } catch (error) {
        console.error("Super Admin verify club error:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
