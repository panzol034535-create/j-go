import { chromium } from "playwright";
import { isZozoUrl } from "@/lib/zozo/scraper";
import {
  buildZozoStockSyncFetchResult,
  type ZozoStockSyncFetchResult,
} from "@/lib/zozo/stock-sync-parse";
import { withTimeout, ZOZO_FETCH_TIMEOUT_MS } from "@/lib/zozo/with-timeout";

async function fetchZozoStockSyncDataInner(url: string): Promise<ZozoStockSyncFetchResult> {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 10_000,
    });

    await page.waitForTimeout(1_500);

    const html = await page.content();
    const finalUrl = page.url();
    const httpStatus = response?.status() ?? 200;

    return buildZozoStockSyncFetchResult({
      html,
      finalUrl,
      httpStatus,
    });
  } finally {
    await browser.close();
  }
}

export async function fetchZozoStockSyncData(url: string): Promise<ZozoStockSyncFetchResult> {
  if (!isZozoUrl(url)) {
    throw new Error("僅支援 ZOZO 商品網址");
  }

  return withTimeout(
    fetchZozoStockSyncDataInner(url),
    ZOZO_FETCH_TIMEOUT_MS,
    "source_timeout"
  );
}
