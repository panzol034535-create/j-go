export function formatPaymentStatus(status: unknown): string {
  const value = String(status || "").trim();

  if (value === "Paid") return "已付款";
  if (value === "Pending") return "待付款";
  if (value === "Failed") return "付款失敗";
  if (value === "Refunded") return "已退款";

  return value || "待付款";
}

export function formatShippingStatus(status: unknown, paymentStatus?: unknown): string {
  const value = String(status || "").trim();

  if (value) return value;

  return String(paymentStatus || "") === "Paid" ? "待出貨" : "未付款";
}

export function formatTrackingNo(trackingNo: unknown): string {
  const value = String(trackingNo || "").trim();
  return value || "尚未提供";
}

export function getPaymentStatusClass(status: unknown): string {
  const value = String(status || "").trim();

  if (value === "Paid") {
    return "bg-green-100 text-green-700";
  }

  if (value === "Failed" || value === "Refunded") {
    return "bg-red-100 text-red-700";
  }

  return "bg-yellow-100 text-yellow-700";
}

export function getShippingStatusClass(status: unknown): string {
  const value = String(status || "").trim();

  if (value === "已出貨") {
    return "bg-blue-100 text-blue-700";
  }

  if (value === "待出貨") {
    return "bg-amber-100 text-amber-700";
  }

  if (value === "未付款") {
    return "bg-neutral-100 text-neutral-600";
  }

  return "bg-neutral-100 text-neutral-600";
}
