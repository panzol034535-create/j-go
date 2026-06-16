import { NextResponse } from "next/server";
import {
  deriveVariantsListUrl,
  mergeVariantsIntoProducts,
} from "@/lib/products/merge-product-variants";
import { withProductSourceFields } from "@/lib/products/product-source-fields";
import { serverErrorResponse } from "@/lib/auth/require-admin";

const DEFAULT_PRODUCTS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/products";

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fetch failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

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

async function fetchVariantRecords(variantsUrl: string): Promise<Record<string, unknown>[]> {
  const candidateUrls = Array.from(
    new Set([
      variantsUrl,
      variantsUrl.replace(/\/variants\/?$/, "/product_variants"),
      variantsUrl.replace(/\/variants\/?$/, "/product-variant"),
    ])
  );

  for (const url of candidateUrls) {
    try {
      const variantsData = await fetchJson(url);
      const records = toRecordArray(variantsData);
      if (records.length > 0) {
        return records;
      }
    } catch (error) {
      console.warn("VARIANT LIST FETCH FAILED:", url, error);
    }
  }

  return [];
}

export async function GET() {
  const productsUrl = process.env.XANO_PRODUCTS_URL || DEFAULT_PRODUCTS_URL;
  const variantsUrl =
    process.env.XANO_LIST_VARIANTS_URL || deriveVariantsListUrl(productsUrl);

  try {
    const productsData = await fetchJson(productsUrl);
    const products = toRecordArray(productsData);
    const variantRecords = await fetchVariantRecords(variantsUrl);
    const mergedProducts = mergeVariantsIntoProducts(products, variantRecords).map((product) =>
      withProductSourceFields(product as Record<string, unknown>)
    );

    return NextResponse.json({
      products: mergedProducts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "讀取商品失敗";
    return serverErrorResponse(message);
  }
}
