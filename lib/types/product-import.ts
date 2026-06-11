export type ZozoProductData = {
  name_jp: string;
  brand: string;
  jpy_price: number;
  description_jp: string;
  main_image: string;
  images: string[];
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
};
