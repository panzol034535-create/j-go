import { NextRequest, NextResponse } from "next/server";
import { enhanceProductWithOpenAI } from "@/lib/openai/translate-product";
import {
  badRequestResponse,
  requireAdminUser,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/auth/require-admin";
import {
  resolveSourceSite,
  resolveSourceUrl,
  type SourceSite,
} from "@/lib/products/source-site";
import { fetchZozoProduct, isZozoUrl } from "@/lib/zozo/scraper";
import type { ZozoProductData } from "@/lib/types/product-import";
import { isValidProductColor } from "@/lib/products/color-normalize";
import {
  normalizeColor,
  normalizeSize,
} from "@/lib/products/variant-stock-normalize";
import { normalizeProductGender, type ProductGender } from "@/lib/products/product-gender";
import { parseSourceProductIdFromUrl } from "@/lib/products/parse-source-product-id";
import { normalizeSizeTableRows, parseSizeTableJson } from "@/lib/products/size-table-json";

type ImportRequestBody = {
  url?: string;
  source_url?: string;
  source_site?: string;
  name_jp?: string;
  brand?: string;
  jpy_price?: number | string;
  price?: number | string;
  description_jp?: string;
  main_image?: string;
  images?: string | string[];
  colors?: string | string[];
  sizes?: string | string[];
  gender?: string;
  variant_stock?: VariantStockEntry[];
  size_table_json?: Array<Record<string, string>> | string;
  model_height_cm?: number | null;
  model_weight_kg?: number | null;
  model_wear_size?: string;
};

type VariantStockEntry = {
  color: string;
  size: string;
  stock_status: string;
};

type XanoProductResponse = {
  id?: number;
  product_id?: number;
};

type VariantPayload = {
  product_id: number;
  color: string;
  size: string;
  stock_status: string;
  stock: number;
};

function importFailureResponse(
  message: string,
  error: string,
  xanoResponse?: string,
  status = 500
) {
  return NextResponse.json(
    {
      success: false,
      message,
      error,
      ...(xanoResponse !== undefined ? { xanoResponse } : {}),
    },
    { status }
  );
}

function toPositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

function buildXanoProductPayload(input: {
  productData: ZozoProductData;
  aiData: Awaited<ReturnType<typeof enhanceProductWithOpenAI>>;
  price: number;
  effectiveColors: string[];
  effectiveSizes: string[];
  source_url: string;
  source_site: SourceSite;
  source_product_id: string;
  gender: ProductGender;
  size_table_json: ReturnType<typeof normalizeSizeTableRows>;
  model_height_cm: number | null;
  model_weight_kg: number | null;
  model_wear_size: string;
}): Record<string, unknown> {
  const {
    productData,
    aiData,
    price,
    effectiveColors,
    effectiveSizes,
    source_url,
    source_site,
    source_product_id,
    gender,
    size_table_json,
    model_height_cm,
    model_weight_kg,
    model_wear_size,
  } = input;

  const payload: Record<string, unknown> = {
    name_jp: productData.name_jp,
    name_zh: aiData.name_zh,
    name: aiData.name_zh,
    brand: productData.brand,
    jpy_price: productData.jpy_price,
    price,
    description_jp: productData.description_jp,
    description_zh: aiData.description_zh,
    description: aiData.description_zh,
    main_image: productData.main_image,
    image: productData.main_image,
    images: productData.images.join(","),
    colors: effectiveColors.join(","),
    sizes: effectiveSizes.join(","),
    tags: aiData.tags,
    tag: aiData.tags.join(","),
    status: "draft",
    source_url,
    source_site,
    gender,
    check_status: "pending",
  };

  if (source_product_id) {
    payload.source_product_id = source_product_id;
  }

  if (size_table_json.length > 0) {
    payload.size_table_json = size_table_json;
  }

  if (model_height_cm !== null) {
    payload.model_height_cm = model_height_cm;
  }

  if (model_weight_kg !== null) {
    payload.model_weight_kg = model_weight_kg;
  }

  if (model_wear_size) {
    payload.model_wear_size = model_wear_size;
  }

  return payload;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createVariantWithRetry(
  variantUrl: string,
  variantPayload: VariantPayload
): Promise<boolean> {
  const maxRetries = 3;
  let retries = 0;

  while (true) {
    console.log("VARIANT PAYLOAD", variantPayload);

    const response = await fetch(variantUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(variantPayload),
    });

    console.log("VARIANT STATUS", response.status);

    const responseText = await response.text();
    console.log("VARIANT RESPONSE", responseText);

    if (response.ok) {
      return true;
    }

    if (response.status === 429 && retries < maxRetries) {
      retries += 1;
      await delay(3000);
      continue;
    }

    console.error(
      "XANO VARIANT ERROR",
      variantPayload,
      response.status,
      responseText
    );
    return false;
  }
}

function parseImagesField(
  images: string | string[] | undefined,
  main_image: string
): string[] {
  let list: string[] = [];

  if (Array.isArray(images)) {
    list = images.map((item) => item.trim()).filter(Boolean);
  } else if (typeof images === "string" && images.trim()) {
    list = images
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (main_image && !list.includes(main_image)) {
    list.unshift(main_image);
  }

  return Array.from(new Set(list)).slice(0, 10);
}

function parseListField(
  value: string | string[] | undefined,
  fallback: string
): string[] {
  if (Array.isArray(value)) {
    const items = value.map((item) => item.trim()).filter(Boolean);
    return items.length > 0 ? items : [fallback];
  }

  if (typeof value === "string" && value.trim()) {
    const items = value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : [fallback];
  }

  return [fallback];
}

function resolvePrice(body: ImportRequestBody, jpy_price: number): number {
  const bodyPrice = Number(body.price);
  if (body.price !== undefined && body.price !== "" && !Number.isNaN(bodyPrice) && bodyPrice > 0) {
    return Math.round(bodyPrice);
  }

  return Math.round(jpy_price * 0.25 * 1.35);
}

function resolveVariantStockStatus(
  normalizedVariantStock: VariantStockEntry[] | undefined,
  color: string,
  size: string
): string {
  if (!Array.isArray(normalizedVariantStock) || normalizedVariantStock.length === 0) {
    return "unknown";
  }

  const normalizedColor = normalizeColor(color);
  const normalizedSize = normalizeSize(size);

  const match = normalizedVariantStock.find(
    (entry) =>
      normalizeColor(entry.color) === normalizedColor &&
      normalizeSize(entry.size) === normalizedSize
  );

  if (!match?.stock_status) {
    console.log("MATCHED STOCK STATUS", "unknown");
    return "unknown";
  }

  if (match.stock_status === "in_stock" || match.stock_status === "out_of_stock") {
    console.log("MATCHED STOCK STATUS", match.stock_status);
    return match.stock_status;
  }

  console.log("MATCHED STOCK STATUS", "unknown");
  return "unknown";
}

function filterVariantStockByColor(
  entries: VariantStockEntry[],
  brand: string
): VariantStockEntry[] {
  return entries.filter((entry) => {
    if (isValidProductColor(entry.color, brand)) {
      return true;
    }

    console.log("REJECT INVALID COLOR", entry.color);
    return false;
  });
}

function buildManualProductData(body: ImportRequestBody): ZozoProductData | null {
  const name_jp = body.name_jp?.trim();
  const brand = body.brand?.trim();
  const jpy_price = Number(body.jpy_price);

  if (!name_jp || !brand || Number.isNaN(jpy_price) || jpy_price <= 0) {
    return null;
  }

  const main_image = body.main_image?.trim() ?? "";
  const images = parseImagesField(body.images, main_image);
  const colorsArray = parseListField(body.colors, "Default");
  const sizesArray = parseListField(body.sizes, "Free");

  return {
    name_jp,
    brand,
    jpy_price,
    description_jp: body.description_jp?.trim() ?? "",
    main_image: images[0] ?? main_image,
    images,
    colors: colorsArray,
    sizes: sizesArray,
  };
}

async function resolveProductData(body: ImportRequestBody): Promise<ZozoProductData> {
  const manualData = buildManualProductData(body);
  const url = body.url?.trim();

  if (url && isZozoUrl(url)) {
    try {
      return await fetchZozoProduct(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ZOZO 抓取失敗";
      console.error("ZOZO SCRAPE FAILED:", message);
      throw new Error(`ZOZO 抓取失敗：${message}`);
    }
  }

  if (!manualData) {
    throw new Error("請提供 name_jp、brand 與有效的 jpy_price");
  }

  return manualData;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return unauthorizedResponse();
  }

  let body: ImportRequestBody;
  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return badRequestResponse("Request body 格式錯誤");
  }

  const importUrl = process.env.XANO_IMPORT_PRODUCT_URL;
  const variantUrl = process.env.XANO_CREATE_VARIANT_URL;
  if (!importUrl || !variantUrl) {
    return serverErrorResponse("Xano API 環境變數未設定");
  }

  let productData: ZozoProductData;
  try {
    productData = await resolveProductData(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "商品資料無效";
    return badRequestResponse(message);
  }

  const price = resolvePrice(body, productData.jpy_price);
  const source_url = resolveSourceUrl(body.source_url, body.url);
  const source_site: SourceSite = resolveSourceSite(body.source_site, source_url);
  const source_product_id =
    parseSourceProductIdFromUrl(source_url) ||
    parseSourceProductIdFromUrl(body.url?.trim() || "");
  const gender: ProductGender = normalizeProductGender(body.gender);
  const size_table_json = normalizeSizeTableRows(parseSizeTableJson(body.size_table_json));
  const model_height_cm = toPositiveInteger(body.model_height_cm);
  const model_weight_kg = toPositiveInteger(body.model_weight_kg);
  const model_wear_size = body.model_wear_size?.trim() || "";

  const variantStockFromBody = Array.isArray(body.variant_stock)
    ? body.variant_stock.map((entry) => ({
        color: normalizeColor(entry.color),
        size: normalizeSize(entry.size),
        stock_status:
          entry.stock_status === "in_stock" || entry.stock_status === "out_of_stock"
            ? entry.stock_status
            : "unknown",
      }))
    : [];

  const productBrand = productData.brand.trim();
  const filteredVariantStock = filterVariantStockByColor(variantStockFromBody, productBrand);

  console.log("IMPORT BODY", body);
  console.log("IMPORT FILTERED VARIANT STOCK", filteredVariantStock);
  console.log("NORMALIZED VARIANT STOCK", variantStockFromBody);

  if (filteredVariantStock.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message: "沒有有效顏色庫存資料",
        error: "沒有有效顏色庫存資料",
      },
      { status: 400 }
    );
  }

  const effectiveColors = [...new Set(filteredVariantStock.map((entry) => entry.color))];
  const effectiveSizes = [...new Set(filteredVariantStock.map((entry) => entry.size))];

  try {
    const aiData = await enhanceProductWithOpenAI({
      ...productData,
      colors: effectiveColors,
      sizes: effectiveSizes,
    });

    const productPayload = buildXanoProductPayload({
      productData,
      aiData,
      price,
      effectiveColors,
      effectiveSizes,
      source_url,
      source_site,
      source_product_id,
      gender,
      size_table_json,
      model_height_cm,
      model_weight_kg,
      model_wear_size,
    });

    console.log("IMPORT PRODUCT PAYLOAD", productPayload);
    console.log("IMPORT SIZE TABLE JSON", size_table_json);
    console.log("IMPORT MODEL SIZE", {
      model_height_cm,
      model_weight_kg,
      model_wear_size,
    });

    const productResponse = await fetch(importUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productPayload),
    });

    const productResponseText = await productResponse.text();

    if (!productResponse.ok) {
      console.error("XANO IMPORT PRODUCT ERROR", productResponse.status, productResponseText);
      return importFailureResponse(
        "匯入失敗",
        `寫入 Xano 商品失敗（HTTP ${productResponse.status}）`,
        productResponseText,
        productResponse.status >= 400 && productResponse.status < 500 ? productResponse.status : 502
      );
    }

    let productResult: XanoProductResponse = {};
    try {
      productResult = productResponseText
        ? (JSON.parse(productResponseText) as XanoProductResponse)
        : {};
    } catch {
      return importFailureResponse(
        "匯入失敗",
        "Xano 商品回應不是有效 JSON",
        productResponseText,
        502
      );
    }

    const productId = productResult.id ?? productResult.product_id;
    if (!productId) {
      return importFailureResponse(
        "匯入失敗",
        "Xano 未回傳 product_id",
        productResponseText,
        502
      );
    }

    const failedVariants: VariantPayload[] = [];

    for (const entry of filteredVariantStock) {
      const variantPayload: VariantPayload = {
        product_id: productId,
        color: entry.color,
        size: entry.size,
        stock_status: entry.stock_status,
        stock: 0,
      };

      const success = await createVariantWithRetry(variantUrl, variantPayload);
      if (!success) {
        failedVariants.push(variantPayload);
      }

      await delay(250);
    }

    if (failedVariants.length > 0) {
      return importFailureResponse(
        "匯入失敗",
        `商品已建立，但有 ${failedVariants.length} 個 variant 建立失敗`,
        JSON.stringify({ failedVariants, productId }),
        502
      );
    }

    return NextResponse.json({
      success: true,
      product: {
        id: productId,
        ...productPayload,
        images: productData.images,
        colors: effectiveColors,
        sizes: effectiveSizes,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "匯入失敗";
    console.error("IMPORT PRODUCT ERROR", error);
    return importFailureResponse("匯入失敗", errorMessage);
  }
}
