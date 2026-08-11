import { NextResponse } from "next/server";
import { buildServerSiteUrl } from "@/lib/site-url";

export async function POST(req: Request) {
  const formData = await req.formData();

  const storeId = formData.get("CVSStoreID") || "";
  const storeName = formData.get("CVSStoreName") || "";
  const address = formData.get("CVSAddress") || "";

  const redirectUrl = buildServerSiteUrl("/", {
    store_id: String(storeId),
    store_name: String(storeName),
    address: String(address),
  });

  return NextResponse.redirect(redirectUrl, 303);
}
