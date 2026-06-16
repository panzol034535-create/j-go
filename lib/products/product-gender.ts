export const PRODUCT_GENDERS = ["male", "female", "unisex"] as const;

export type ProductGender = (typeof PRODUCT_GENDERS)[number];

export function isProductGender(value: string): value is ProductGender {
  return PRODUCT_GENDERS.includes(value as ProductGender);
}

export function normalizeProductGender(value: unknown): ProductGender {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (isProductGender(normalized)) {
    return normalized;
  }

  return "unisex";
}

export function getProductGenderLabel(gender: ProductGender): string {
  switch (gender) {
    case "male":
      return "男生";
    case "female":
      return "女生";
    case "unisex":
      return "中性";
    default:
      return "中性";
  }
}
