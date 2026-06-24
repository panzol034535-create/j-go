import type { InitialRankings } from "@/lib/home-initial-data";
import type { FormattedLookbook } from "@/lib/lookbooks/format-lookbook-list";
import type { FormattedXanoProduct } from "@/lib/products/format-xano-product";

export type JGoCartItem = {
  key: string;
  id: number;
  name: string;
  brand: string;
  price: number;
  image: string;
  color: string;
  size: string;
  qty: number;
  stock: number;
};

export type JGoUser = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  provider?: string;
};

export type JGoProduct = FormattedXanoProduct;

export type JGoLookbook = FormattedLookbook;

export type JGoOrder = {
  id: number | string;
  items?: unknown[];
  total?: number;
  delivery?: string;
  pickupStore?: {
    store_name?: string;
    store_id?: string;
    address?: string;
  };
  shippingAddress?: {
    city?: string;
    district?: string;
    address?: string;
  };
  status?: string;
  shippingStatus?: string;
  trackingNo?: string;
  shippingCompany?: string;
  shippedAt?: string;
  customerName?: string;
  customerEmail?: string;
  createdAt?: string;
};

export type JGoAppProps = {
  initialProducts?: JGoProduct[];
  initialLookbooks?: JGoLookbook[];
  initialRankings?: InitialRankings;
};

export type StockStatusMap = Record<string, string>;
export type StockQtyMap = Record<string, number>;
