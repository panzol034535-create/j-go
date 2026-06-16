type AnalyticsItem = {
  id?: string | number;
  name?: string;
  brand?: string;
  price?: number;
  quantity?: number;
  color?: string;
  size?: string;
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CURRENCY = "TWD";

function isAnalyticsEnabled(): boolean {
  return typeof window !== "undefined" && Boolean(GA_MEASUREMENT_ID) && typeof window.gtag === "function";
}

function trackEvent(eventName: string, params?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) {
    return;
  }

  window.gtag!("event", eventName, params);
}

function toAnalyticsItems(items: AnalyticsItem[] = []) {
  return items.map((item) => ({
    item_id: String(item.id ?? ""),
    item_name: item.name || "",
    item_brand: item.brand || "",
    price: Number(item.price) || 0,
    quantity: Number(item.quantity) || 1,
    item_variant: [item.color, item.size].filter(Boolean).join(" / ") || undefined,
  }));
}

function getItemsValue(items: AnalyticsItem[] = []): number {
  return items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  );
}

export function getGaMeasurementId(): string | undefined {
  return GA_MEASUREMENT_ID;
}

export function initAnalytics(): void {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  window.gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
  });
}

export function trackHomeView(): void {
  trackEvent("view_home", {
    page_title: "首頁",
    page_location: typeof window !== "undefined" ? window.location.href : undefined,
  });
}

export function trackProductView(product: AnalyticsItem & { brand?: string }): void {
  const items = toAnalyticsItems([{ ...product, quantity: 1 }]);

  trackEvent("view_item", {
    currency: CURRENCY,
    value: getItemsValue([{ ...product, quantity: 1 }]),
    items,
  });
}

export function trackAddToCart(items: AnalyticsItem[]): void {
  const normalizedItems = toAnalyticsItems(items);

  trackEvent("add_to_cart", {
    currency: CURRENCY,
    value: getItemsValue(items),
    items: normalizedItems,
  });
}

export function trackBeginCheckout(items: AnalyticsItem[], value?: number): void {
  trackEvent("begin_checkout", {
    currency: CURRENCY,
    value: typeof value === "number" ? value : getItemsValue(items),
    items: toAnalyticsItems(items),
  });
}

export function trackPurchaseSuccess(options?: {
  transactionId?: string | number;
  value?: number;
  items?: AnalyticsItem[];
}): void {
  trackEvent("purchase", {
    currency: CURRENCY,
    transaction_id: options?.transactionId ? String(options.transactionId) : undefined,
    value: options?.value,
    items: options?.items ? toAnalyticsItems(options.items) : undefined,
  });
}

export function trackFavoriteProduct(product: AnalyticsItem): void {
  trackEvent("favorite_product", {
    item_id: String(product.id ?? ""),
    item_name: product.name || "",
    item_brand: product.brand || "",
  });
}

export function trackFavoriteLookbook(lookbook: {
  id?: string | number;
  title?: string;
  tag?: string;
}): void {
  trackEvent("favorite_lookbook", {
    lookbook_id: String(lookbook.id ?? ""),
    lookbook_title: lookbook.title || "",
    lookbook_tag: lookbook.tag || "",
  });
}

export function trackSearchProducts(searchTerm: string): void {
  const term = searchTerm.trim();
  if (!term) {
    return;
  }

  trackEvent("search", {
    search_term: term,
  });
}

export function trackBrandClick(brand: string): void {
  const value = brand.trim();
  if (!value) {
    return;
  }

  trackEvent("select_brand", {
    brand_name: value,
  });
}

export function readLatestPurchaseFromStorage(userEmail?: string): {
  transactionId?: string | number;
  value?: number;
  items?: AnalyticsItem[];
} {
  if (typeof window === "undefined" || !userEmail) {
    return {};
  }

  try {
    const savedOrders = JSON.parse(localStorage.getItem("jgo_orders_by_user") || "{}");
    const userOrders = savedOrders[userEmail];
    const latestOrder = Array.isArray(userOrders) ? userOrders[0] : null;

    if (!latestOrder) {
      return {};
    }

    return {
      transactionId: latestOrder.id,
      value: Number(latestOrder.total) || undefined,
      items: Array.isArray(latestOrder.items)
        ? latestOrder.items.map((item: AnalyticsItem & { product_name?: string; unit_price?: number; qty?: number }) => ({
            id: item.id,
            name: item.name || item.product_name,
            price: item.price || item.unit_price,
            quantity: item.qty || item.quantity || 1,
            color: item.color,
            size: item.size,
          }))
        : undefined,
    };
  } catch {
    return {};
  }
}
