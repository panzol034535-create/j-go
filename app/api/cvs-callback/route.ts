import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const formData = await req.formData();

  const storeId = formData.get("CVSStoreID") || "";
  const storeName = formData.get("CVSStoreName") || "";
  const address = formData.get("CVSAddress") || "";

  const redirectUrl =
    `https://j-go-xd5a.vercel.app` +
    `?store_id=${encodeURIComponent(String(storeId))}` +
    `&store_name=${encodeURIComponent(String(storeName))}` +
    `&address=${encodeURIComponent(String(address))}`;

  return NextResponse.redirect(redirectUrl, 303);
}