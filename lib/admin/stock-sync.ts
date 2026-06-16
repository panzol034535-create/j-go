export function buildStockSyncUrl(sourceUrl: string, productId: number): string {
  const url = new URL(sourceUrl);
  url.hash = `jgo-sync=${productId}`;
  return url.toString();
}

export function openStockSync(sourceUrl: string | undefined, productId: number): boolean {
  const trimmedUrl = sourceUrl?.trim();

  if (!trimmedUrl) {
    alert("此商品沒有來源網址，無法同步庫存");
    return false;
  }

  if (!trimmedUrl.includes("zozo.jp")) {
    alert("目前僅支援 ZOZO 商品庫存同步，請確認 source_url");
    return false;
  }

  window.open(buildStockSyncUrl(trimmedUrl, productId), "_blank", "noopener,noreferrer");
  return true;
}
