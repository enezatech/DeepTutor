import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionCookieName, isProduction } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: getSessionCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ success: true });
}
