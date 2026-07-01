import type { SourceSite } from "@/lib/products/source-site";
import type { ProductGender } from "@/lib/products/product-gender";
import type { ZozoSizeTableRow } from "@/lib/products/size-table-json";

export type ZozoProductData = {
  name_jp: string;
  brand: string;
  jpy_price: number;
  description_jp: string;
  main_image: string;
  images: string[];
  color_images?: Record<string, string[]>;
  colors: string[];
  sizes: string[];
};

export type OpenAIProductEnhancement = {
  name_zh: string;
  description_zh: string;
  tags: string[];
};

export type ImportedProduct = ZozoProductData &
  OpenAIProductEnhancement & {
    id: number;
    status: string;
    gender?: ProductGender;
    source_url?: string;
    source_site?: SourceSite;
    source_product_id?: string;
    check_status?: string;
  };

export type DraftProduct = {
  id: number;
  name_jp: string;
  name_zh: string;
  brand: string;
  jpy_price: number;
  description_jp: string;
  description_zh: string;
  main_image: string;
  images: string[];
  tags: string[];
  status: string;
  gender: ProductGender;
  source_url: string;
  source_site: SourceSite;
  source_product_id: string;
  sourceUrl?: string;
  url?: string;
  size_table_json?: ZozoSizeTableRow[];
};
