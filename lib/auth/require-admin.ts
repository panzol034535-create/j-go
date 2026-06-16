import { NextResponse } from "next/server";

export async function requireAdminUser() {
  return true;
}

export function badRequestResponse(message = "Bad request") {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function unauthorizedResponse(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function serverErrorResponse(message = "Server error") {
  return NextResponse.json({ error: message }, { status: 500 });
}