import type { SalesRankingEntry } from "@/lib/rankings/sales-ranking";
import { toRecordArray } from "@/lib/rankings/ranking-response";

const DEFAULT_SALES_RANKINGS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/sales-rankings";

export function resolveXanoSalesRankingsUrl(): string {
  return process.env.XANO_SALES_RANKINGS_URL?.trim() || DEFAULT_SALES_RANKINGS_URL;
}

export function parseXanoSalesRankings(data: unknown, limit = 10): SalesRankingEntry[] {
  const records = toRecordArray(data);

  return records
    .map((record) => ({
      product_id: Number(record.product_id ?? record.id ?? 0),
      product_name: String(record.product_name ?? record.name ?? "").trim(),
      total_qty: Number(record.total_qty ?? record.qty ?? record.sold_count ?? record.totalQty ?? 0),
    }))
    .filter((entry) => entry.product_id > 0 && entry.total_qty > 0)
    .sort((a, b) => b.total_qty - a.total_qty)
    .slice(0, limit);
}

type FetchXanoSalesRankingsOptions = {
  limit?: number;
  period?: "week" | "all";
  fetchImpl?: typeof fetch;
  revalidate?: number | false;
};

export async function fetchXanoSalesRankings(
  options: FetchXanoSalesRankingsOptions = {}
): Promise<SalesRankingEntry[]> {
  const limit = Math.min(Math.max(Number(options.limit ?? 10), 1), 50);
  const period = options.period === "all" ? "all" : "week";
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = resolveXanoSalesRankingsUrl();
  const separator = baseUrl.includes("?") ? "&" : "?";
  const url = `${baseUrl}${separator}limit=${limit}&period=${period}`;

  const response = await fetchImpl(url, {
    next: options.revalidate === false ? undefined : { revalidate: options.revalidate ?? 60 },
    cache: options.revalidate === false ? "no-store" : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`讀取 Xano 銷售排行失敗：${response.status} ${errorText}`);
  }

  const data = await response.json();
  return parseXanoSalesRankings(data, limit);
}
