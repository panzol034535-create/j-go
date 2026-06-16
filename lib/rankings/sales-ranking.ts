export type SalesRankingEntry = {
  product_id: number;
  product_name: string;
  total_qty: number;
};

export type OrderItemRecord = Record<string, unknown>;

export function resolveOrderItemProductId(item: OrderItemRecord): number {
  const id = Number(item.product_id ?? item.products_id ?? item.productId ?? 0);
  return !Number.isNaN(id) && id > 0 ? id : 0;
}

export function resolveOrderItemQty(item: OrderItemRecord): number {
  const qty = Number(item.qty ?? item.quantity ?? 1);
  return !Number.isNaN(qty) && qty > 0 ? qty : 0;
}

export function resolveOrderItemProductName(item: OrderItemRecord): string {
  return String(item.product_name ?? item.name ?? "").trim();
}

export function buildProductNameIndex(
  products: Array<{ id?: unknown; name?: unknown }>
): Map<string, number> {
  const index = new Map<string, number>();

  for (const product of products) {
    const id = Number(product.id);
    const name = String(product.name || "").trim().toLowerCase();
    if (id > 0 && name) {
      index.set(name, id);
    }
  }

  return index;
}

export function resolveOrderItemProductIdWithFallback(
  item: OrderItemRecord,
  nameIndex: Map<string, number>
): number {
  const directId = resolveOrderItemProductId(item);
  if (directId > 0) {
    return directId;
  }

  const name = resolveOrderItemProductName(item).toLowerCase();
  if (!name) {
    return 0;
  }

  return nameIndex.get(name) || 0;
}

export function aggregateSalesByProductId(
  items: Array<{ product_id: number; qty: number; product_name?: string }>
): SalesRankingEntry[] {
  const totals = new Map<number, { qty: number; name: string }>();

  for (const item of items) {
    if (!item.product_id || !item.qty) {
      continue;
    }

    const existing = totals.get(item.product_id) || { qty: 0, name: item.product_name || "" };
    totals.set(item.product_id, {
      qty: existing.qty + item.qty,
      name: existing.name || item.product_name || "",
    });
  }

  return Array.from(totals.entries())
    .map(([product_id, data]) => ({
      product_id,
      product_name: data.name,
      total_qty: data.qty,
    }))
    .sort((a, b) => b.total_qty - a.total_qty);
}

export function isOrderWithinPeriod(
  createdAt: unknown,
  period: "week" | "all"
): boolean {
  if (period === "all") {
    return true;
  }

  const timestamp = Number(createdAt);
  if (!timestamp || Number.isNaN(timestamp)) {
    return false;
  }

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - timestamp <= weekMs;
}

export function isPaidOrder(paymentStatus: unknown): boolean {
  return String(paymentStatus || "").trim() === "Paid";
}
