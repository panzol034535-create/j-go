import type { DraftProduct } from "@/lib/types/product-import";
import {
  resolveProductSourceProductId,
  resolveProductSourceSite,
  resolveProductSourceUrl,
} from "@/lib/products/product-source-fields";
import { normalizeProductGender } from "@/lib/products/product-gender";
import { parseSizeTableJson } from "@/lib/products/size-table-json";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function parseImages(value: unknown, mainImage: string): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return mainImage ? [mainImage] : [];
}

export function normalizeDraftProduct(raw: Record<string, unknown>): DraftProduct | null {
  const id = Number(raw.id ?? raw.product_id);
  if (!id || Number.isNaN(id)) {
    return null;
  }

  const main_image = toStringValue(raw.main_image || raw.image);
  const source_url = resolveProductSourceUrl(raw);
  const source_site = resolveProductSourceSite(raw, source_url);
  const source_product_id = resolveProductSourceProductId(raw, source_url);

  return {
    id,
    name_jp: toStringValue(raw.name_jp),
    name_zh: toStringValue(raw.name_zh || raw.name),
    brand: toStringValue(raw.brand),
    jpy_price: toNumber(raw.jpy_price),
    description_jp: toStringValue(raw.description_jp),
    description_zh: toStringValue(raw.description_zh || raw.description),
    main_image,
    images: parseImages(raw.images, main_image),
    tags: parseTags(raw.tags ?? raw.tag),
    status: toStringValue(raw.status) || "draft",
    gender: normalizeProductGender(raw.gender),
    source_url,
    source_site,
    source_product_id,
    size_table_json: parseSizeTableJson(raw.size_table_json),
  };
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
        return candidate.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
      }
    }
  }

  return [];
}

export function normalizeDraftProducts(data: unknown): DraftProduct[] {
  return toRecordArray(data)
    .map((item) => normalizeDraftProduct(item))
    .filter((item): item is DraftProduct => item !== null);
}

export function enrichDraftProductsWithCatalog(
  drafts: DraftProduct[],
  catalog: Record<string, unknown>[]
): DraftProduct[] {
  const catalogById = new Map<number, Record<string, unknown>>();

  for (const item of catalog) {
    const id = Number(item.id);
    if (id && !Number.isNaN(id)) {
      catalogById.set(id, item);
    }
  }

  return drafts.map((draft) => {
    const catalogItem = catalogById.get(draft.id);
    const catalogSourceUrl = catalogItem ? resolveProductSourceUrl(catalogItem) : "";
    const source_url = draft.source_url || catalogSourceUrl;
    const source_site = resolveProductSourceSite(
      {
        ...(catalogItem || {}),
        source_url,
        source_site: draft.source_site,
      },
      source_url
    );
    const source_product_id =
      draft.source_product_id ||
      resolveProductSourceProductId(
        {
          ...(catalogItem || {}),
          source_url,
        },
        source_url
      );

    return {
      ...draft,
      source_url,
      source_site,
      source_product_id,
      gender: normalizeProductGender(draft.gender || catalogItem?.gender),
      size_table_json:
        draft.size_table_json && draft.size_table_json.length > 0
          ? draft.size_table_json
          : parseSizeTableJson(catalogItem?.size_table_json),
    };
  });
}
