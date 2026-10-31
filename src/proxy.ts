import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin-login") {
    return NextResponse.next();
  }

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isSuperAdminRoute = pathname === "/super-admin" || pathname.startsWith("/super-admin/");
  const isAdminApiRoute = pathname.startsWith("/api/admin/") || pathname === "/api/admin";

  if (!isAdminRoute && !isSuperAdminRoute && !isAdminApiRoute) {
    return NextResponse.next();
  }

  const session = await getSession(request);
  if (!session || session.kind !== "admin") {
    if (isAdminApiRoute) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: admin session required" },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/admin-login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isSuperAdminRoute && session.role !== "super_admin") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", session.id);
  requestHeaders.set("x-user-role", session.role);
  if (session.organizationId) {
    requestHeaders.set("x-organization-id", session.organizationId);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}
