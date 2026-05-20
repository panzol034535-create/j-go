import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.redirect(
    "https://j-go-xd5a.vercel.app?payment=success",
    303
  );
}