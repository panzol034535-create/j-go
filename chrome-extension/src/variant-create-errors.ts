export type FailedVariantDetail = {
  color: string;
  size: string;
  stock_status: string;
  stock_qty: number;
  reason: string;
  status: number;
  responseText: string;
};

export function formatFailedVariantsMessage(
  failedVariants: FailedVariantDetail[]
): string {
  if (failedVariants.length === 0) {
    return "商品已建立，但有 variant 建立失敗";
  }

  const details = failedVariants
    .map((item) => `${item.color} / ${item.size}（${item.reason}）`)
    .join("；");

  return `商品已建立，但以下規格建立失敗：${details}`;
}

export function resolveImportErrorMessage(data: {
  error?: string;
  failedVariants?: FailedVariantDetail[];
}): string {
  const failedVariants = Array.isArray(data.failedVariants) ? data.failedVariants : [];
  if (failedVariants.length > 0) {
    return formatFailedVariantsMessage(failedVariants);
  }

  return data.error || "匯入失敗";
}
