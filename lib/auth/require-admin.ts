import { currentUser } from "@clerk/nextjs/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { NextResponse } from "next/server";

export async function requireAdminUser() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;

  if (!user || !isAdminEmail(email)) {
    return null;
  }

  return user;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "沒有權限" }, { status: 403 });
}

export function badRequestResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverErrorResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}
