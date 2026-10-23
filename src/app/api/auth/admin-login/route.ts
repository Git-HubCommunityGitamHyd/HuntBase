import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPassword } from "@/lib/utils/helpers";
import { setSessionCookie } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return NextResponse.json(
                { success: false, message: "Username and password required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // 1. Check host_users table first (Modern multi-tenant auth)
        const { data: hostUser, error: hostError } = await supabase
            .from("host_users")
            .select("id, organization_id, email, username, full_name, role, is_active, password_hash")
            .or(`username.eq.${username},email.eq.${username}`)
            .single();

        if (!hostError && hostUser) {
            if (!hostUser.is_active) {
                return NextResponse.json(
                    { success: false, message: "Account is disabled. Contact super admin." },
                    { status: 403 }
                );
            }

            const isValid = await verifyPassword(password, hostUser.password_hash);
            if (!isValid) {
                return NextResponse.json(
                    { success: false, message: "Invalid credentials" },
                    { status: 401 }
                );
            }

            // Update last login
            await supabase
                .from("host_users")
                .update({ last_login_at: new Date().toISOString() })
                .eq("id", hostUser.id);

            // Fetch organization details
            const { data: org } = await supabase
                .from("organizations")
                .select("id, name, slug, logo_url")
                .eq("id", hostUser.organization_id)
                .single();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { password_hash: _pwd, ...safeUser } = hostUser;

            const response = NextResponse.json({
                success: true,
                message: "Admin login successful",
                admin: {
                    ...safeUser,
                    organization: org || null,
                    is_admin: true,
                },
            });

            // Set secure HttpOnly session cookie
            return setSessionCookie(response, {
                id: hostUser.id,
                username: hostUser.username,
                role: hostUser.role as "super_admin" | "club_admin",
                organization_id: hostUser.organization_id,
            });
        }

        // 2. Fallback to legacy teams table (where is_admin = true)
        const { data: legacyAdmin, error: legacyError } = await supabase
            .from("teams")
            .select("*")
            .eq("username", username)
            .eq("is_admin", true)
            .single();

        if (legacyError || !legacyAdmin) {
            return NextResponse.json(
                { success: false, message: "Invalid credentials" },
                { status: 401 }
            );
        }

        const legacyAdminData = legacyAdmin as { password_hash: string; [key: string]: unknown };
        const isLegacyValid = await verifyPassword(password, legacyAdminData.password_hash);

        if (!isLegacyValid) {
            return NextResponse.json(
                { success: false, message: "Invalid credentials" },
                { status: 401 }
            );
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password_hash: _legacyPwd, ...safeLegacyAdmin } = legacyAdmin;

        const response = NextResponse.json({
            success: true,
            message: "Admin login successful",
            admin: safeLegacyAdmin,
        });

        // Set secure HttpOnly session cookie for legacy admin
        return setSessionCookie(response, {
            id: legacyAdmin.id,
            username: legacyAdmin.username || "admin",
            role: "club_admin",
            organization_id: (legacyAdmin as { organization_id?: string }).organization_id || "a0000000-0000-0000-0000-000000000001",
        });
    } catch (error) {
        console.error("Admin login error:", error);
        return NextResponse.json(
            { success: false, message: "An error occurred" },
            { status: 500 }
        );
    }
}
