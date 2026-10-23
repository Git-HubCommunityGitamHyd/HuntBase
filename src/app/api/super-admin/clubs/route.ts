import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    try {
        const session = getSession(request);
        if (!session || session.role !== "super_admin") {
            return NextResponse.json(
                { success: false, message: "Unauthorized: Super Admin access required" },
                { status: 403 }
            );
        }

        const supabase = createAdminClient();

        // 1. Fetch all organizations
        const { data: orgs, error: orgsError } = await supabase
            .from("organizations")
            .select(`
                id,
                name,
                slug,
                description,
                contact_email,
                is_verified,
                created_at,
                host_users (
                    id,
                    username,
                    full_name,
                    email,
                    role,
                    is_active
                ),
                events (
                    id,
                    name,
                    is_active
                )
            `)
            .order("created_at", { ascending: false });

        if (orgsError) {
            console.error("Error fetching organizations:", orgsError);
            return NextResponse.json(
                { success: false, message: "Failed to fetch clubs" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            clubs: orgs || [],
        });
    } catch (error) {
        console.error("Super Admin clubs fetch error:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}

// DELETE a club
export async function DELETE(request: NextRequest) {
    try {
        const session = getSession(request);
        if (!session || session.role !== "super_admin") {
            return NextResponse.json(
                { success: false, message: "Unauthorized: Super Admin access required" },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const organizationId = searchParams.get("organization_id");

        if (!organizationId) {
            return NextResponse.json(
                { success: false, message: "organization_id is required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // Prevent deleting the primary GitHub Community organization
        const { data: targetOrg } = await supabase
            .from("organizations")
            .select("slug")
            .eq("id", organizationId)
            .single();

        if (targetOrg?.slug === "github-community") {
            return NextResponse.json(
                { success: false, message: "Cannot delete the primary GitHub Community organization" },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from("organizations")
            .delete()
            .eq("id", organizationId);

        if (error) {
            console.error("Error deleting club:", error);
            return NextResponse.json(
                { success: false, message: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Club and all associated records deleted cleanly",
        });
    } catch (error) {
        console.error("Super admin club deletion error:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
