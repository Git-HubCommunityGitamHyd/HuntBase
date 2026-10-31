


import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, destroySession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {

  await destroySession(request);
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  return clearSessionCookie(response);
}