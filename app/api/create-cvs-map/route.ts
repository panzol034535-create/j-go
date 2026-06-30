import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, serverErrorResponse } from "@/lib/auth/require-admin";

const DEFAULT_MAP_URL = "https://logistics.ecpay.com.tw/Express/map";
const DEFAULT_SITE_URL = "https://j-go-xd5a.vercel.app";

function resolveMapUrl(): string {
  const configured = process.env.ECPAY_LOGISTICS_MAP_URL?.trim();
  return configured || DEFAULT_MAP_URL;
}

function resolveSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configured || DEFAULT_SITE_URL).replace(/\/$/, "");
}

function generateCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const raw = `HashKey=${hashKey}&${sortedParams}&HashIV=${hashIV}`;
  const encoded = encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%20/g, "+")
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");

  return createHash("md5").update(encoded).digest("hex").toUpperCase();
}

type CreateCvsMapBody = {
  logistics_sub_type?: string;
};

export async function POST(request: NextRequest) {
  let body: CreateCvsMapBody;

  try {
    body = (await request.json()) as CreateCvsMapBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const merchantId = process.env.ECPAY_LOGISTICS_MERCHANT_ID?.trim();
  const hashKey = process.env.ECPAY_LOGISTICS_HASH_KEY?.trim();
  const hashIV = process.env.ECPAY_LOGISTICS_HASH_IV?.trim();

  if (!merchantId || !hashKey || !hashIV) {
    return serverErrorResponse("綠界物流 env 未設定完整");
  }

  const cvsMapUrl = resolveMapUrl();
  const siteUrl = resolveSiteUrl();
  const logisticsSubType =
    String(body.logistics_sub_type ?? "UNIMART").trim() || "UNIMART";
  const merchantTradeNo = `JGO${Date.now()}`;

  const params = {
    MerchantID: merchantId,
    MerchantTradeNo: merchantTradeNo,
    LogisticsType: "CVS",
    LogisticsSubType: logisticsSubType,
    IsCollection: "N",
    ServerReplyURL: `${siteUrl}/api/cvs-callback`,
    Device: "0",
  };

  const checkMacValue = generateCheckMacValue(params, hashKey, hashIV);

  return NextResponse.json({
    cvs_map_url: cvsMapUrl,
    ...params,
    CheckMacValue: checkMacValue,
  });
}
