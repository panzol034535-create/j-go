export type VariantStock = {
  color: string;
  size: string;
  stock_status: "in_stock" | "out_of_stock" | "unknown";
};

export type ZozoSizeTableRow = {
  size: string;
  body_width?: string;
  shoulder_width?: string;
  length?: string;
  sleeve_length?: string;
  waist?: string;
  hip?: string;
  rise?: string;
  inseam?: string;
  thigh?: string;
  hem_width?: string;
};

export type ImportProductPayload = {
  name_jp: string;
  brand: string;
  jpy_price: number;
  description_jp: string;
  main_image: string;
  images: string[];
  colors: string;
  sizes: string;
  variant_stock?: VariantStock[];
  size_table_json?: ZozoSizeTableRow[];
  model_height_cm?: number | null;
  model_weight_kg?: number | null;
  model_wear_size?: string;
  source_url: string;
  source_site: string;
};

export type ScrapeResult = Omit<ImportProductPayload, "source_url" | "source_site"> & {
  source_url?: string;
  source_site?: string;
};

export type ImportProductResponse = {
  success?: boolean;
  error?: string;
  product?: {
    id: number;
    name_zh?: string;
  };
};

export type SyncProductStockPayload = {
  product_id: number;
  variant_stock: VariantStock[];
};

export type SyncProductStockResponse = {
  success?: boolean;
  error?: string;
  synced_count?: number;
  message?: string;
};

export type BackgroundMessage =
  | { type: "IMPORT_PRODUCT"; payload: ImportProductPayload }
  | { type: "SYNC_PRODUCT_STOCK"; payload: SyncProductStockPayload }
  | { type: "GET_API_BASE_URL" };

export type BackgroundResponse =
  | { ok: true; data: ImportProductResponse }
  | { ok: true; data: SyncProductStockResponse }
  | { ok: false; error: string }
  | { ok: true; apiBaseUrl: string };

export const DEFAULT_API_BASE_URL = "http://localhost:3000";
export const STORAGE_KEY_API_BASE_URL = "jgoApiBaseUrl";
