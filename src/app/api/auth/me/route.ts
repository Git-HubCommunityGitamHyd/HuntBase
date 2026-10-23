import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    try {
        const session = getSession(request);
        if (!session) {
            return NextResponse.json({ success: false, admin: null }, { status: 401 });
        }

        const supabase = createAdminClient();

        // 1. Check host_users
        const { data: hostUser } = await supabase
            .from("host_users")
            .select("id, organization_id, email, username, full_name, role, is_active")
            .eq("id", session.id)
            .maybeSingle();

        if (hostUser && hostUser.is_active) {
            const { data: org } = await supabase
                .from("organizations")
                .select("id, name, slug, logo_url")
                .eq("id", hostUser.organization_id)
                .maybeSingle();

            return NextResponse.json({
                success: true,
                admin: {
                    ...hostUser,
                    organization: org || null,
                    is_admin: true,
                },
            });
        }

        // 2. Check legacy admin in teams
        const { data: legacyAdmin } = await supabase
            .from("teams")
            .select("id, team_name, username, is_admin")
            .eq("id", session.id)
            .eq("is_admin", true)
            .maybeSingle();

        if (legacyAdmin) {
            return NextResponse.json({
                success: true,
                admin: {
                    ...legacyAdmin,
                    role: "super_admin",
                    is_admin: true,
                },
            });
        }

        return NextResponse.json({ success: false, admin: null }, { status: 401 });
    } catch (error) {
        console.error("Session verification error:", error);
        return NextResponse.json({ success: false, admin: null }, { status: 500 });
    }
}
