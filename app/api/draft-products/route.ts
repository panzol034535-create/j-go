import { NextResponse } from "next/server";
import {
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import {
  enrichDraftProductsWithCatalog,
  normalizeDraftProducts,
} from "@/lib/products/normalize-draft-product";

const DEFAULT_PRODUCTS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/products";

function toRecordArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const candidates = [record.products, record.items, record.data, record.result];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter((item) => item && typeof item === "object") as Record<
          string,
          unknown
        >[];
      }
    }
  }

  return [];
}

async function fetchProductsCatalog(): Promise<Record<string, unknown>[]> {
  const productsUrl = process.env.XANO_PRODUCTS_URL || DEFAULT_PRODUCTS_URL;

  try {
    const response = await fetch(`${productsUrl}?t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("DRAFT PRODUCTS CATALOG FETCH FAILED", response.status);
      return [];
    }

    const data = await response.json();
    return toRecordArray(data);
  } catch (error) {
    console.warn("DRAFT PRODUCTS CATALOG FETCH ERROR", error);
    return [];
  }
}

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  const draftUrl = process.env.XANO_DRAFT_PRODUCTS_URL;
  if (!draftUrl) {
    return serverErrorResponse("XANO_DRAFT_PRODUCTS_URL 未設定");
  }

  try {
    const response = await fetch(`${draftUrl}?t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return serverErrorResponse(`讀取 Draft 商品失敗：${errorText}`);
    }

    const data = await response.json();
    const rawRecords = toRecordArray(data);
    const normalizedDrafts = normalizeDraftProducts(data);
    const catalog = await fetchProductsCatalog();
    const products = enrichDraftProductsWithCatalog(normalizedDrafts, catalog);

    if (rawRecords[0]) {
      console.log("DRAFT PRODUCTS RAW KEYS", Object.keys(rawRecords[0]));
      console.log("DRAFT PRODUCTS RAW SAMPLE", {
        id: rawRecords[0].id,
        source_url: rawRecords[0].source_url,
        sourceUrl: rawRecords[0].sourceUrl,
        url: rawRecords[0].url,
      });
    }

    products.forEach((product) => {
      console.log("DRAFT PRODUCT", {
        id: product.id,
        source_url: product.source_url,
        source_site: product.source_site,
      });
    });

    return NextResponse.json({ products });
  } catch (error) {
    const message = error instanceof Error ? error.message : "讀取失敗";
    return serverErrorResponse(message);
  }
}
