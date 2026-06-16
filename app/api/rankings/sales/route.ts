import { NextRequest, NextResponse } from "next/server";
import { serverErrorResponse } from "@/lib/auth/require-admin";
import {
  aggregateSalesByProductId,
  buildProductNameIndex,
  isOrderWithinPeriod,
  isPaidOrder,
  resolveOrderItemProductIdWithFallback,
  resolveOrderItemProductName,
  resolveOrderItemQty,
} from "@/lib/rankings/sales-ranking";

const DEFAULT_ADMIN_ORDERS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-orders";
const DEFAULT_ORDER_ITEMS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/order-items";
const DEFAULT_PRODUCTS_URL =
  "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/products";

function toRecordArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const candidates = [record.orders, record.items, record.products, record.data, record.result];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter((item) => item && typeof item === "object") as Record<
          string,
          unknown
        >[];
      }
    }
  }

  return [];
}

export async function GET(request: NextRequest) {
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 10), 1), 50);
  const period = request.nextUrl.searchParams.get("period") === "all" ? "all" : "week";

  const ordersUrl = process.env.XANO_ADMIN_ORDERS_URL || DEFAULT_ADMIN_ORDERS_URL;
  const orderItemsUrl = process.env.XANO_GET_ORDER_ITEMS_URL || DEFAULT_ORDER_ITEMS_URL;
  const productsUrl = process.env.XANO_PRODUCTS_URL || DEFAULT_PRODUCTS_URL;

  try {
    const [ordersResponse, productsResponse] = await Promise.all([
      fetch(`${ordersUrl}?t=${Date.now()}`, { cache: "no-store" }),
      fetch(`${productsUrl}?t=${Date.now()}`, { cache: "no-store" }),
    ]);

    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      return serverErrorResponse(`讀取訂單失敗：${errorText}`);
    }

    const ordersData = await ordersResponse.json();
    const allOrders = toRecordArray(ordersData);

    let products: Record<string, unknown>[] = [];
    if (productsResponse.ok) {
      const productsData = await productsResponse.json();
      products = toRecordArray(productsData);
    }

    const nameIndex = buildProductNameIndex(products);

    const eligibleOrders = allOrders.filter((order) => {
      if (!isPaidOrder(order.payment_status)) {
        return false;
      }

      return isOrderWithinPeriod(order.created_at, period);
    });

    const itemGroups = await Promise.all(
      eligibleOrders.map(async (order) => {
        const orderId = Number(order.id);
        if (!orderId) {
          return [];
        }

        try {
          const itemsResponse = await fetch(`${orderItemsUrl}?order_id=${orderId}`, {
            cache: "no-store",
          });

          if (!itemsResponse.ok) {
            return [];
          }

          const itemsData = await itemsResponse.json();
          return toRecordArray(itemsData);
        } catch {
          return [];
        }
      })
    );

    const normalizedItems = itemGroups.flat().map((item) => {
      const product_id = resolveOrderItemProductIdWithFallback(item, nameIndex);
      return {
        product_id,
        qty: resolveOrderItemQty(item),
        product_name: resolveOrderItemProductName(item),
      };
    });

    const rankings = aggregateSalesByProductId(normalizedItems).slice(0, limit);

    return NextResponse.json({
      period,
      limit,
      rankings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "讀取銷售排行失敗";
    return serverErrorResponse(message);
  }
}
