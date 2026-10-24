import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSession } from "@/lib/auth/session";

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Exclude public admin login page from route interception
    if (pathname === "/admin-login") {
        return NextResponse.next();
    }

    // 2. Check for protected admin and super-admin routes
    const isSuperAdminPageRoute = pathname === "/super-admin" || pathname.startsWith("/super-admin/");
    const isSuperAdminApiRoute = pathname === "/api/super-admin" || pathname.startsWith("/api/super-admin/");
    const isSuperAdminRoute = isSuperAdminPageRoute || isSuperAdminApiRoute;

    const isAdminPageRoute = pathname === "/admin" || pathname.startsWith("/admin/");
    const isAdminApiRoute = pathname === "/api/admin" || pathname.startsWith("/api/admin/");
    const isAdminRoute = isAdminPageRoute || isAdminApiRoute;

    if (isAdminRoute || isSuperAdminRoute) {
        const sessionCookie = request.cookies.get("huntbase_session");
        const session = sessionCookie?.value ? decodeSession(sessionCookie.value) : null;

        // If not authenticated
        if (!session) {
            if (isSuperAdminApiRoute || isAdminApiRoute) {
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
            if (isSuperAdminApiRoute) {
                return NextResponse.json(
                    { success: false, message: "Forbidden: Super Admin access required" },
                    { status: 403 }
                );
            }
            return NextResponse.redirect(new URL("/admin", request.url));
        }

        // Verify super_admin or club_admin role for admin routes
        if (isAdminRoute && session.role !== "super_admin" && session.role !== "club_admin") {
            if (isAdminApiRoute) {
                return NextResponse.json(
                    { success: false, message: "Forbidden: Admin access required" },
                    { status: 403 }
                );
            }
            const loginUrl = new URL("/admin-login", request.url);
            loginUrl.searchParams.set("redirect", pathname);
            return NextResponse.redirect(loginUrl);
        }

        // Inject verified tenant and user info into headers for downstream handlers
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-user-id", session.id);
        requestHeaders.set("x-user-role", session.role);
        requestHeaders.delete("x-organization-id");
        if (session.organization_id) {
            requestHeaders.set("x-organization-id", session.organization_id);
        }

        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    }

    return NextResponse.next();
}

export const config = {
    runtime: "nodejs",
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
