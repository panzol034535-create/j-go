import { NextRequest, NextResponse } from "next/server";

type OrderNotificationItem = {
  product_id?: number | string;
  name?: string;
  brand?: string;
  color?: string;
  size?: string;
  qty?: number;
  unit_price?: number;
  subtotal?: number;
};

type OrderNotificationBody = {
  order_id?: number | string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  clerk_user_id?: string;
  delivery_method?: string;
  pickup_store_name?: string;
  pickup_store_code?: string;
  pickup_store_address?: string;
  home_city?: string;
  home_district?: string;
  home_address?: string;
  subtotal_price?: number;
  shipping_fee?: number;
  discount_amount?: number;
  discounted_subtotal?: number;
  total_price?: number;
  coupon_code?: string;
  items?: OrderNotificationItem[];
};

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "LookPick <onboarding@resend.dev>";

function toText(value: unknown, fallback = "") {
  const stringValue = String(value ?? "").trim();
  return stringValue || fallback;
}

function formatMoney(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "NT$ 0";
  return `NT$ ${numberValue.toLocaleString("zh-TW")}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeItems(items: unknown): OrderNotificationItem[] {
  if (!Array.isArray(items)) return [];

  return items.filter(
    (item): item is OrderNotificationItem => Boolean(item) && typeof item === "object"
  );
}

function formatDelivery(body: OrderNotificationBody) {
  if (body.delivery_method === "711") {
    return [
      "7-11 取貨",
      toText(body.pickup_store_name, "未提供門市名稱"),
      body.pickup_store_code ? `門市代碼：${toText(body.pickup_store_code)}` : "",
      toText(body.pickup_store_address),
    ]
      .filter(Boolean)
      .join(" / ");
  }

  return [
    "宅配",
    `${toText(body.home_city)}${toText(body.home_district)}${toText(body.home_address)}`,
  ]
    .filter(Boolean)
    .join(" / ");
}

function buildTextEmail(body: OrderNotificationBody, items: OrderNotificationItem[]) {
  const itemLines = items.map((item, index) => {
    return [
      `${index + 1}. ${toText(item.name, "未命名商品")}`,
      item.brand ? `品牌：${toText(item.brand)}` : "",
      `規格：${toText(item.color, "-")} / ${toText(item.size, "-")}`,
      `數量：${Number(item.qty) || 0}`,
      `單價：${formatMoney(item.unit_price)}`,
      `小計：${formatMoney(item.subtotal)}`,
    ]
      .filter(Boolean)
      .join("｜");
  });

  return [
    "LookPick 新訂單通知",
    "",
    `訂單編號：${toText(body.order_id, "-")}`,
    `客戶姓名：${toText(body.customer_name, "-")}`,
    `Email：${toText(body.customer_email, "-")}`,
    `手機：${toText(body.customer_phone, "-")}`,
    `會員 ID：${toText(body.clerk_user_id, "-")}`,
    `配送方式：${formatDelivery(body) || "-"}`,
    "",
    `商品小計：${formatMoney(body.subtotal_price)}`,
    body.coupon_code ? `折扣碼：${toText(body.coupon_code)}（-${formatMoney(body.discount_amount)}）` : "",
    body.coupon_code ? `折扣後小計：${formatMoney(body.discounted_subtotal)}` : "",
    `運費：${formatMoney(body.shipping_fee)}`,
    `訂單總計：${formatMoney(body.total_price)}`,
    "",
    "商品明細：",
    ...itemLines,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildHtmlEmail(body: OrderNotificationBody, items: OrderNotificationItem[]) {
  const rows = items
    .map((item) => {
      return `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #eee;">
            <div style="font-weight:700;">${escapeHtml(toText(item.name, "未命名商品"))}</div>
            <div style="color:#666;font-size:13px;">${escapeHtml(toText(item.brand))}</div>
            <div style="color:#666;font-size:13px;">${escapeHtml(toText(item.color, "-"))} / ${escapeHtml(toText(item.size, "-"))}</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid #eee;text-align:center;">${escapeHtml(Number(item.qty) || 0)}</td>
          <td style="padding:12px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(formatMoney(item.unit_price))}</td>
          <td style="padding:12px;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${escapeHtml(formatMoney(item.subtotal))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;line-height:1.6;">
      <h1 style="margin:0 0 16px;font-size:24px;">LookPick 新訂單通知</h1>
      <div style="padding:16px;border:1px solid #eee;border-radius:16px;margin-bottom:16px;">
        <p style="margin:0;"><strong>訂單編號：</strong>${escapeHtml(toText(body.order_id, "-"))}</p>
        <p style="margin:0;"><strong>客戶：</strong>${escapeHtml(toText(body.customer_name, "-"))}</p>
        <p style="margin:0;"><strong>Email：</strong>${escapeHtml(toText(body.customer_email, "-"))}</p>
        <p style="margin:0;"><strong>手機：</strong>${escapeHtml(toText(body.customer_phone, "-"))}</p>
        <p style="margin:0;"><strong>配送：</strong>${escapeHtml(formatDelivery(body) || "-")}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:16px;overflow:hidden;">
        <thead>
          <tr style="background:#fafafa;">
            <th style="padding:12px;text-align:left;">商品</th>
            <th style="padding:12px;text-align:center;">數量</th>
            <th style="padding:12px;text-align:right;">單價</th>
            <th style="padding:12px;text-align:right;">小計</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="4" style="padding:12px;">沒有商品明細</td></tr>`}</tbody>
      </table>

      <div style="padding:16px;border:1px solid #eee;border-radius:16px;margin-top:16px;">
        <p style="margin:0;display:flex;justify-content:space-between;"><span>商品小計</span><strong>${escapeHtml(formatMoney(body.subtotal_price))}</strong></p>
        ${
          body.coupon_code
            ? `<p style="margin:0;display:flex;justify-content:space-between;color:#d00;"><span>折扣碼 ${escapeHtml(toText(body.coupon_code))}</span><strong>-${escapeHtml(formatMoney(body.discount_amount))}</strong></p>
               <p style="margin:0;display:flex;justify-content:space-between;"><span>折扣後小計</span><strong>${escapeHtml(formatMoney(body.discounted_subtotal))}</strong></p>`
            : ""
        }
        <p style="margin:0;display:flex;justify-content:space-between;"><span>運費</span><strong>${escapeHtml(formatMoney(body.shipping_fee))}</strong></p>
        <p style="margin:8px 0 0;padding-top:8px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:18px;"><span>總計</span><strong>${escapeHtml(formatMoney(body.total_price))}</strong></p>
      </div>
    </div>
  `;
}

export async function POST(request: NextRequest) {
  let body: OrderNotificationBody;

  try {
    body = (await request.json()) as OrderNotificationBody;
  } catch {
    return NextResponse.json({ success: false, message: "Request body 格式錯誤" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.ORDER_NOTIFICATION_EMAIL?.trim();
  const from = process.env.ORDER_NOTIFICATION_FROM?.trim() || DEFAULT_FROM;

  if (!apiKey || !to) {
    return NextResponse.json(
      { success: false, message: "訂單通知 Email 尚未設定" },
      { status: 500 }
    );
  }

  const items = normalizeItems(body.items);
  const orderId = toText(body.order_id, "未取得訂單編號");

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "LookPick order notification",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `LookPick 新訂單通知 #${orderId}`,
      html: buildHtmlEmail(body, items),
      text: buildTextEmail(body, items),
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    console.error("ORDER NOTIFICATION EMAIL FAILED", response.status, responseText);
    return NextResponse.json(
      { success: false, message: "訂單通知 Email 寄送失敗" },
      { status: response.status }
    );
  }

  const data = await response.json().catch(() => null);
  return NextResponse.json({ success: true, data });
}
