import {
  deriveVariantsListUrl,
  mergeVariantsIntoProducts,
} from "@/lib/products/merge-product-variants";
import { withProductSourceFields } from "@/lib/products/product-source-fields";
import { toRecordArray } from "@/lib/rankings/ranking-response";
import {
  fetchRevalidatedJson,
  isXanoFetchError,
} from "@/lib/server/fetch-revalidated";
import {
  getCachedVariantsEndpoint,
  getVariantCandidateUrls,
  rememberVariantsEndpoint,
} from "@/lib/server/variants-endpoint-cache";

const DEFAULT_PRODUCTS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/products";

async function fetchVariantRecords(variantsUrl: string): Promise<Record<string, unknown>[]> {
  const cachedEndpoint = getCachedVariantsEndpoint(variantsUrl);

  if (cachedEndpoint) {
    try {
      const variantsData = await fetchRevalidatedJson(cachedEndpoint);
      const records = toRecordArray(variantsData);
      if (records.length > 0) {
        return records;
      }
    } catch (error) {
      if (isXanoFetchError(error) && error.status === 429) {
        throw error;
      }

      console.warn("VARIANT LIST CACHED FETCH FAILED:", cachedEndpoint, error);
    }
  }

  for (const url of getVariantCandidateUrls(variantsUrl)) {
    try {
      const variantsData = await fetchRevalidatedJson(url);
      const records = toRecordArray(variantsData);
      if (records.length > 0) {
        rememberVariantsEndpoint(variantsUrl, url);
        return records;
      }
    } catch (error) {
      if (isXanoFetchError(error) && error.status === 429) {
        throw error;
      }

      console.warn("VARIANT LIST FETCH FAILED:", url, error);
    }
  }

  return [];
}

export async function fetchMergedProducts(): Promise<Record<string, unknown>[]> {
  const productsUrl = process.env.XANO_PRODUCTS_URL || DEFAULT_PRODUCTS_URL;
  const variantsUrl =
    process.env.XANO_LIST_VARIANTS_URL || deriveVariantsListUrl(productsUrl);

  const productsData = await fetchRevalidatedJson(productsUrl);
  const products = toRecordArray(productsData);
  const variantRecords = await fetchVariantRecords(variantsUrl);

  return mergeVariantsIntoProducts(products, variantRecords).map((product) =>
    withProductSourceFields(product as Record<string, unknown>)
  );
}
