import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSession } from "@/lib/auth/session";

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Check for admin routes protection
    const isAdminRoute = pathname.startsWith("/admin");
    const isSuperAdminRoute = pathname.startsWith("/super-admin");
    const isAdminApiRoute = pathname.startsWith("/api/admin");

    if (isAdminRoute || isSuperAdminRoute || isAdminApiRoute) {
        const sessionCookie = request.cookies.get("huntbase_session");
        const session = sessionCookie?.value ? decodeSession(sessionCookie.value) : null;

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
