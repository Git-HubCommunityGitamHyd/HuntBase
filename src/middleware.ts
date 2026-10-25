import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminSessionToken, verifySessionToken } from "@/lib/auth/edge-session";
import {
    ADMIN_SESSION_COOKIE_NAME,
    PLAYER_SESSION_COOKIE_NAME,
} from "@/lib/auth/session-token";

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Exclude public admin login page from route interception
    if (pathname === "/admin-login") {
        return NextResponse.next();
    }

    // 2. Check for protected admin routes (/admin, /admin/*, /super-admin, /api/admin/*)
    const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
    const isSuperAdminRoute = pathname === "/super-admin" || pathname.startsWith("/super-admin/");
    const isAdminApiRoute = pathname === "/api/admin" || pathname.startsWith("/api/admin/")
        || pathname === "/api/super-admin" || pathname.startsWith("/api/super-admin/");
    const isPlayerPage = pathname === "/hunt" || pathname.startsWith("/hunt/")
        || pathname === "/scan" || pathname.startsWith("/scan/");
    const isPlayerApi = pathname === "/api/scan" || pathname.startsWith("/api/scan/")
        || pathname === "/api/hunt" || pathname.startsWith("/api/hunt/")
        || pathname === "/api/hints" || pathname.startsWith("/api/hints/");

    if (isAdminRoute || isSuperAdminRoute || isAdminApiRoute) {
        const session = await verifyAdminSessionToken(
            request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value
        );

        // If not authenticated
        if (!session) {
            if (isAdminApiRoute) {
                return NextResponse.json(
                    { success: false, message: "Unauthorized: Admin session required" },
                    { status: 401 }
                );
            }
            const loginUrl = new URL("/admin-login", request.url);
            loginUrl.searchParams.set("redirect", pathname);
            return NextResponse.redirect(loginUrl);
        }

        // Verify super_admin role for super-admin routes
        if (isSuperAdminRoute && session.role !== "super_admin") {
            return NextResponse.redirect(new URL("/admin", request.url));
        }

        // Inject verified tenant and user info into headers for downstream handlers
        const requestHeaders = new Headers(request.headers);
        requestHeaders.delete("x-user-id");
        requestHeaders.delete("x-user-role");
        requestHeaders.delete("x-organization-id");
        requestHeaders.delete("x-team-id");
        requestHeaders.delete("x-player-id");
        requestHeaders.set("x-user-id", session.id);
        requestHeaders.set("x-user-role", session.role);
        if (session.organization_id) {
            requestHeaders.set("x-organization-id", session.organization_id);
        }

        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    }

    if (isPlayerPage || isPlayerApi) {
        const session = await verifySessionToken(
            request.cookies.get(PLAYER_SESSION_COOKIE_NAME)?.value
        );
        if (!session || session.role !== "player") {
            if (isPlayerApi) {
                return NextResponse.json(
                    { success: false, message: "Unauthorized: Player session required" },
                    { status: 401 }
                );
            }
            const loginUrl = new URL("/login", request.url);
            loginUrl.searchParams.set("redirect", pathname);
            return NextResponse.redirect(loginUrl);
        }

        const requestHeaders = new Headers(request.headers);
        requestHeaders.delete("x-user-id");
        requestHeaders.delete("x-user-role");
        requestHeaders.delete("x-organization-id");
        requestHeaders.delete("x-team-id");
        requestHeaders.delete("x-player-id");
        requestHeaders.set("x-user-id", session.id);
        requestHeaders.set("x-user-role", session.role);
        if (session.organization_id) requestHeaders.set("x-organization-id", session.organization_id);
        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder assets
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
