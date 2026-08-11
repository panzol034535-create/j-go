import { NextResponse } from "next/server";
import { buildServerSiteUrl } from "@/lib/site-url";

export async function POST() {
  return NextResponse.redirect(
    buildServerSiteUrl("/", {
      payment: "success",
    }),
    303,
  );
}
