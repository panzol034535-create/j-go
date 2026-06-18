// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { ShoppingBag, Search, Home, User, Package, Trash2, Plus, Minus, MapPin, Truck, Store, CheckCircle2, Mail, Lock, LogOut, Sparkles, ChevronDown, Heart, ShieldCheck, Clock } from "lucide-react";
import {
  findFirstSelectableSize,
  getProductColorOptions,
  getProductDescription,
  getProductSizeNames,
  getSizeOptionsForColor,
  getSizeStockQty,
  getVariantForColorAndSize,
  isSizeOutOfStock,
  isSizeSelectable,
  parseCommaList,
  parseProductVariants,
} from "@/lib/products/product-fields";
import { openStockSync } from "@/lib/admin/stock-sync";
import { detectSourceSite } from "@/lib/products/source-site";
import {
  getSizeTableColumns,
  parseSizeTableJson,
  SIZE_TABLE_FIELD_LABELS,
} from "@/lib/products/size-table-json";
import {
  formatModelSizeDisplay,
  getProductModelSizeFields,
} from "@/lib/products/zozo-model-size";
import { SizeTableEditor } from "@/components/admin/SizeTableEditor";
import { buildSizeRecommendation, normalizeSizeName } from "@/lib/products/size-recommendation";
import { filterProductsBySearch } from "@/lib/products/product-search";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { isFavoriteProduct, loadFavoriteIds, saveFavoriteIds, toggleFavoriteId } from "@/lib/favorites";
import { formatShippedAt, toDatetimeLocalValue, toIsoDateTime } from "@/lib/orders/shipping";
import {
  formatPaymentStatus,
  formatShippingStatus,
  formatTrackingNo,
  getPaymentStatusClass,
  getShippingStatusClass,
} from "@/lib/orders/order-status";
import { runPrelaunchChecks, summarizePrelaunchChecks } from "@/lib/prelaunch-check";
import {
  syncLookbookFavoriteCount,
  syncProductFavoriteCount,
} from "@/lib/rankings/favorite-ranking";
import { parseRankingItems } from "@/lib/rankings/ranking-response";
import { HOME_TRUST_CARDS, PRODUCT_TRUST_BADGES } from "@/lib/trust-signals";
import {
  readLatestPurchaseFromStorage,
  trackAddToCart,
  trackBeginCheckout,
  trackBrandClick,
  trackFavoriteLookbook,
  trackFavoriteProduct,
  trackHomeView,
  trackProductView,
  trackPurchaseSuccess,
  trackSearchProducts,
} from "@/lib/analytics";
import {
  isFavoriteLookbook,
  loadFavoriteLookbookIds,
  resolveLookbookId,
  saveFavoriteLookbookIds,
  toggleFavoriteLookbookId,
} from "@/lib/lookbook-favorites";
import {
  hasHomeLookbooksCache as readHasHomeLookbooksCache,
  hasHomeRankingsCache as readHasHomeRankingsCache,
  readHomeLookbooksCache,
  readHomeProductsCache,
  readHomeRankingsCache,
  readProductsCacheV2,
  saveHomeLookbooksCache,
  saveHomeRankingsCache,
  saveProductsCacheV2,
} from "@/lib/home-cache";

function Button({ children, onClick, className = "" }) {
  const hasColorOverride = className.includes("text-neutral") || className.includes("text-black") || className.includes("text-white");

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 font-bold transition ${hasColorOverride ? "" : "text-white"} ${className}`}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "" }) {
  return <div className={`border bg-white ${className}`}>{children}</div>;
}

function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

const fallbackProducts = [];

function formatPrice(n) {
  const value = Number(n);
  if (Number.isNaN(value)) return "NT$ 0";
  return `NT$ ${value.toLocaleString("zh-TW")}`;
}

function formatProductGender(gender) {
  if (gender === "male") return "男生";
  if (gender === "female") return "女生";
  return "中性";
}

function getStockDisplayLabel(status, stock) {
  if (status === "out_of_stock" || (typeof stock === "number" && stock <= 0)) {
    return "已售完";
  }

  if (status === "in_stock" && typeof stock === "number" && stock > 0 && stock <= 3) {
    return "剩少量";
  }

  if (status === "in_stock") {
    return "有現貨";
  }

  return "";
}

function getColorStockMaps(product) {
  const statusMap = {};
  const stockMap = {};

  for (const color of getProductColorOptions(product)) {
    const sizes = getSizeOptionsForColor(product, color);
    const availableSizes = sizes.filter((size) => !isSizeOutOfStock(size) && getSizeStockQty(size) > 0);

    if (availableSizes.length === 0) {
      statusMap[color] = "out_of_stock";
      stockMap[color] = 0;
      continue;
    }

    const lowestStock = Math.min(...availableSizes.map((size) => getSizeStockQty(size)));
    statusMap[color] = "in_stock";
    stockMap[color] = lowestStock;
  }

  return { statusMap, stockMap };
}

function buildProductFeatureText(product, description) {
  return [
    description,
    product?.material ? `材質：${product.material}` : "",
    product?.fit ? `版型：${product.fit}` : "",
  ].filter(Boolean).join("\n\n");
}

function buildProductSizeInfoText(product) {
  const model = getProductModelSizeFields(product);
  const modelText = formatModelSizeDisplay({
    model_height_cm: model.height || null,
    model_weight_kg: model.weight || null,
    model_wear_size: model.wearSize,
  });

  return [
    modelText,
    product?.recommendedHeight ? `建議身高：${product.recommendedHeight}` : "",
    product?.recommendedWeight ? `建議體重：${product.recommendedWeight}` : "",
  ].filter(Boolean).join("\n");
}

function buildBrandIntroText(product) {
  const brand = product?.brand?.trim();
  if (!brand) return "";

  return [
    `${brand} 為 J-GO 精選日本品牌。`,
    product?.tag ? `系列標籤：${product.tag}` : "",
    "點擊品牌名稱可查看更多同品牌商品。",
  ].filter(Boolean).join("\n");
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "FREE"];

function getAvailableSizeNames(product) {
  if (!product) {
    return [];
  }

  const fromVariants = (product.variants || [])
    .flatMap((variant) => variant.sizes || [])
    .filter((size) => Number(size.stock ?? 999) > 0)
    .map((size) => normalizeSizeName(size.name))
    .filter(Boolean);

  const fromSizes = getProductSizeNames(product).map(normalizeSizeName).filter(Boolean);
  const unique = Array.from(new Set([...fromVariants, ...fromSizes]));

  return unique.sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a);
    const bi = SIZE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

const XANO_CHECKOUT_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/checkout";
const XANO_ADD_ORDER_ITEM_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/add-order-item";
const XANO_GET_ORDERS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/Get_Orders";
const XANO_GET_ORDER_ITEMS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/order-items";
const XANO_CREATE_ECPAY_ORDER_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/create-ecpay-order";
const XANO_CREATE_CVS_MAP_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/create-cvs-map";
const XANO_DECREASE_STOCK_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/decrease-stock";
const XANO_LOOKBOOKS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/lookbooks";
const XANO_UPDATE_ORDER_SHIPPING_STATUS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-order-shipping-status";
const XANO_ADMIN_ORDERS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-orders";
const XANO_ADMIN_CREATE_PRODUCT_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-create-product";
const XANO_ADMIN_UPDATE_PRODUCT_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-update-product";
const XANO_ADMIN_DELETE_PRODUCT_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-delete-product";
const XANO_RECALCULATE_PRODUCTS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-recalculate-all-products";

function formatLookbookList(list) {
  return list.map((lookbook, index) => {
    const id = resolveLookbookId(lookbook, index);

    return {
      id,
      lookbook_id: lookbook.lookbook_id || lookbook.id || id,
      title: lookbook.title || "J-GO Lookbook",
      image: lookbook.image,
      tag: lookbook.tag || lookbook.style_tag || "AI LOOKBOOK",
      gender: lookbook.gender || "unisex",
      product_ids: String(lookbook.product_ids || "")
        .split(",")
        .map((value) => Number(value.trim()))
        .filter(Boolean),
      raw_product_ids: lookbook.product_ids || "",
      favoriteCount: Number(lookbook.favorite_count) || 0,
    };
  });
}

export default function JGoAppPrototype() {
  const { user, isSignedIn } = useUser();
  const [tab, setTab] = useState("home");
  const [products, setProducts] = useState([]);
  const [lookbooks, setLookbooks] = useState(() => readHomeLookbooksCache() ?? []);
  const [selectedLookbook, setSelectedLookbook] = useState(null);
  const [outfitSelections, setOutfitSelections] = useState({});
  const [activeGender, setActiveGender] = useState("all");
  const [activeBrand, setActiveBrand] = useState("all");
  const [shopSearchQuery, setShopSearchQuery] = useState("");
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favoriteLookbookIds, setFavoriteLookbookIds] = useState([]);
  const [favoritesTab, setFavoritesTab] = useState("products");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isHomeDataLoading, setIsHomeDataLoading] = useState(true);
  const [isLookbookLoading, setIsLookbookLoading] = useState(() => !readHasHomeLookbooksCache());
  const [isRankingLoading, setIsRankingLoading] = useState(() => !readHasHomeRankingsCache());
  const [hasProductsCache, setHasProductsCache] = useState(false);
  const [hasHomeLookbooksCache, setHasHomeLookbooksCache] = useState(() => readHasHomeLookbooksCache());
  const [hasHomeRankingsCache, setHasHomeRankingsCache] = useState(() => readHasHomeRankingsCache());
  const [homeDataLoadError, setHomeDataLoadError] = useState(false);
  const [lookbooksLoadError, setLookbooksLoadError] = useState(false);
  const [rankingLoadError, setRankingLoadError] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cart, setCart] = useState([]);
  const [delivery, setDelivery] = useState(() => {
    if (typeof window === "undefined") return "711";
    return localStorage.getItem("jgo_delivery") || "711";
  });
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderFilter, setOrderFilter] = useState("all");
  const [trackingForms, setTrackingForms] = useState({});
  const [prelaunchChecks, setPrelaunchChecks] = useState([]);
  const [prelaunchLoading, setPrelaunchLoading] = useState(false);
  const [salesRankings, setSalesRankings] = useState(() => readHomeRankingsCache()?.salesRankings ?? []);
  const [favoriteProductRankings, setFavoriteProductRankings] = useState(
    () => readHomeRankingsCache()?.favoriteProductRankings ?? []
  );
  const [favoriteLookbookRankings, setFavoriteLookbookRankings] = useState(
    () => readHomeRankingsCache()?.favoriteLookbookRankings ?? []
  );
  const [isFavoriteProductsRankingLoading, setIsFavoriteProductsRankingLoading] = useState(
    () => !readHasHomeRankingsCache()
  );
  const [isFavoriteLookbooksRankingLoading, setIsFavoriteLookbooksRankingLoading] = useState(
    () => !readHasHomeRankingsCache()
  );
  const [favoriteProductsRankingError, setFavoriteProductsRankingError] = useState(false);
  const [favoriteLookbooksRankingError, setFavoriteLookbooksRankingError] = useState(false);
  const checkoutTrackedRef = useRef(false);
  const [authMode, setAuthMode] = useState("login");
  const [currentUser, setCurrentUser] = useState(null);
  const [authForm, setAuthForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [accountForm, setAccountForm] = useState({ name: "", email: "", phone: "" });
  const [checkoutForm, setCheckoutForm] = useState({ name: "", email: "", phone: "" });
  const [pickupStore, setPickupStore] = useState(() => {
    if (typeof window === "undefined") {
      return { store_name: "", store_id: "", address: "" };
    }
    try {
      const savedPickupStore = localStorage.getItem("jgo_pickup_store");
      return savedPickupStore
        ? JSON.parse(savedPickupStore)
        : { store_name: "", store_id: "", address: "" };
    } catch {
      return { store_name: "", store_id: "", address: "" };
    }
  });
  const [shippingAddress, setShippingAddress] = useState({
    city: "",
    district: "",
    address: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [lookbookForm, setLookbookForm] = useState({
    title: "",
    image: "",
    tag: "",
    gender: "unisex",
    product_ids: "",
  });
  const [editingLookbookId, setEditingLookbookId] = useState(null);
  const [sizeAI, setSizeAI] = useState({ gender: "male", height: "", weight: "" });
  const [sizeAIResult, setSizeAIResult] = useState(null);
  const [productForm, setProductForm] = useState({
    name: "",
    brand: "",
    jpy_price: "",
    image: "",
    images: "",
    colors: "",
    sizes: "",
    variants: "",
    gender: "unisex",
    tag: "日本選品",
    description: "",
    material: "",
    fit: "",
    model_height: "",
    model_weight: "",
    model_size: "",
    recommended_height: "",
    recommended_weight: "",
    size_chart: "",
  });
  const [editingProductId, setEditingProductId] = useState(null);
  const isAdmin = user?.primaryEmailAddress?.emailAddress === "panzol034535@gmail.com";
  const touchStartX = React.useRef(null);
  const ordersLoadingRef = React.useRef(false);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart]);

  useEffect(() => {
    if (!isSignedIn || !user) {
      setCurrentUser(null);
      localStorage.removeItem("jgo_current_user");
      setAccountForm({ name: "", email: "", phone: "" });
      setCheckoutForm({ name: "", email: "", phone: "" });
      return;
    }

    const clerkUser = {
      id: user.id,
      name: user.fullName || user.firstName || "J-GO 會員",
      email: user.primaryEmailAddress?.emailAddress || "",
      phone: user.primaryPhoneNumber?.phoneNumber || "",
      provider: "Clerk",
    };

    setCurrentUser(clerkUser);
    localStorage.setItem("jgo_current_user", JSON.stringify(clerkUser));
    setAccountForm({ name: clerkUser.name, email: clerkUser.email, phone: clerkUser.phone });
    setCheckoutForm({ name: clerkUser.name, email: clerkUser.email, phone: clerkUser.phone });
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem("jgo_cart");
      const parsedCart = savedCart ? JSON.parse(savedCart) : [];
      const nextCart = Array.isArray(parsedCart) ? parsedCart : [];
      setCart(nextCart);
      setCartCount(nextCart.length);
    } catch {
      setCart([]);
      setCartCount(0);
    }

    setMounted(true);

    try {
      setFavoriteIds(loadFavoriteIds());
    } catch {
      setFavoriteIds([]);
    }

    try {
      setFavoriteLookbookIds(loadFavoriteLookbookIds());
    } catch {
      setFavoriteLookbookIds([]);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setCartCount(cart.length);
    localStorage.setItem("jgo_cart", JSON.stringify(cart));
  }, [cart, mounted]);

  useEffect(() => {
    localStorage.setItem("jgo_pickup_store", JSON.stringify(pickupStore));
  }, [pickupStore]);

  useEffect(() => {
    localStorage.setItem("jgo_delivery", delivery);
  }, [delivery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    if (params.get("payment") === "success") {
      const savedUser = localStorage.getItem("jgo_current_user");

      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          trackPurchaseSuccess(readLatestPurchaseFromStorage(user.email));
        } catch {
          trackPurchaseSuccess();
        }
      } else {
        trackPurchaseSuccess();
      }

      setPaymentMessage("付款成功，正在更新訂單...");
      setTab("payment-result");
      refreshProductsFromXano({ hasCache: true });

      if (savedUser) {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);

        setTimeout(async () => {
          await loadOrdersForUser(user);
          setTab("orders");
        }, 3500);
      }

      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    const storeId = params.get("store_id") || params.get("CVSStoreID");
    const storeName = params.get("store_name") || params.get("CVSStoreName");
    const storeAddress = params.get("address") || params.get("CVSAddress");

    if (storeId && storeName) {
      const nextPickupStore = {
        store_id: storeId,
        store_name: storeName,
        address: storeAddress || "",
      };
      setPickupStore(nextPickupStore);
      localStorage.setItem("jgo_pickup_store", JSON.stringify(nextPickupStore));
      setDelivery("711");
      setTab("checkout");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (tab === "orders" && currentUser?.email) {
      loadOrdersForUser(currentUser);
    }
  }, [tab, currentUser?.email]);

  const formatXanoProducts = (productList) => {
    return productList.map((product) => {
      const images = product.images
        ? product.images.split(",").map((url) => url.trim()).filter(Boolean)
        : product.image
          ? [product.image]
          : [];

      console.log("PRODUCT VARIANTS", product.variants);
      const variants = parseProductVariants(product);

      const source_url =
        product.source_url || product.sourceUrl || product.url || "";
      const source_site =
        product.source_site || product.sourceSite || (source_url ? detectSourceSite(source_url) : "unknown");
      const source_product_id =
        product.source_product_id ||
        product.sourceProductId ||
        (source_url.match(/\/goods(?:-sale)?\/(\d+)/i)?.[1] || "");

      return {
        id: product.id,
        name: product.name,
        brand: product.brand,
        price: product.price,
        jpyPrice: product.jpy_price,
        compareAt: product.compare_at,
        image: images[0] || product.image,
        images,
        colors: getProductColorOptions({ variants, colors: product.colors }),
        sizes: parseCommaList(product.sizes),
        variants,
        variantRecords: Array.isArray(product.variants) ? product.variants : [],
        tag: product.tag || "日本選品",
        gender: product.gender || "unisex",
        description: getProductDescription(product),
        description_zh: product.description_zh || "",
        description_jp: product.description_jp || "",
        material: product.material || "",
        fit: product.fit || "",
        modelHeight: product.model_height || product.model_height_cm || "",
        modelWeight: product.model_weight || product.model_weight_kg || "",
        modelSize: product.model_size || product.model_wear_size || "",
        modelHeightCm: product.model_height_cm || product.model_height || "",
        modelWeightKg: product.model_weight_kg || product.model_weight || "",
        modelWearSize: product.model_wear_size || product.model_size || "",
        recommendedHeight: product.recommended_height || "",
        recommendedWeight: product.recommended_weight || "",
        sizeChart: product.size_chart || "",
        sizeTableJson: parseSizeTableJson(product.size_table_json),
        source_url,
        source_site,
        source_product_id,
        favoriteCount: Number(product.favorite_count) || 0,
      };
    });
  };

  const applyProducts = (nextProducts) => {
    if (!Array.isArray(nextProducts) || nextProducts.length === 0) return;

    setProducts(nextProducts);
    setSelectedProduct((prev) => {
      const sameProduct = nextProducts.find((product) => product.id === prev?.id);
      return sameProduct || nextProducts[0];
    });

    const activeProduct = nextProducts.find((product) => product.id === selectedProduct?.id) || nextProducts[0];
    if (!activeProduct) {
      return;
    }

    const activeVariant = activeProduct.variants?.find((variant) => variant.color === selectedColor) || activeProduct.variants?.[0];
    const colorOptions = getProductColorOptions(activeProduct);
    const sizeOptions = getProductSizeNames(activeProduct);
    const nextColor = activeVariant?.color || colorOptions[0] || "";
    const nextSize = findFirstSelectableSize(activeVariant?.sizes || [])?.name
      || activeVariant?.sizes?.[0]?.name
      || sizeOptions[0]
      || "";

    setSelectedColor(nextColor);
    setSelectedSize(nextSize);
    setSelectedImageIndex(0);
  };

  const refreshProductsFromXano = async ({ hasCache = hasProductsCache } = {}) => {
    if (!hasCache) {
      setLoadingProducts(true);
      setIsHomeDataLoading(true);
    }
    setHomeDataLoadError(false);

    try {
      const response = await fetchWithTimeout(`/api/products?t=${Date.now()}`, {}, 15000);

      if (!response.ok) {
        throw new Error(`商品 API 載入失敗：${response.status}`);
      }

      const data = await response.json();
      const productList = Array.isArray(data.products) ? data.products : Array.isArray(data) ? data : [];
      const formattedProducts = formatXanoProducts(productList);

      console.log("PRODUCT API COUNT", formattedProducts.length);

      if (formattedProducts.length > 0) {
        saveProductsCacheV2(formattedProducts);
        setHasProductsCache(true);
        applyProducts(formattedProducts);
      }
    } catch (error) {
      console.error("讀取商品失敗", error);
      if (!hasCache) {
        setHomeDataLoadError(true);
      }
    } finally {
      setLoadingProducts(false);
      setIsHomeDataLoading(false);
    }
  };

  useEffect(() => {
    let hasCache = false;

    try {
      const cachedProducts = readProductsCacheV2();
      if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
        console.log("PRODUCT CACHE COUNT", cachedProducts.length);
        applyProducts(cachedProducts);
        hasCache = true;
        setHasProductsCache(true);
        setLoadingProducts(false);
        setIsHomeDataLoading(false);
      } else {
        const legacyHomeProducts = readHomeProductsCache();
        if (Array.isArray(legacyHomeProducts) && legacyHomeProducts.length > 0) {
          console.log("PRODUCT CACHE COUNT", legacyHomeProducts.length);
          applyProducts(legacyHomeProducts);
          saveProductsCacheV2(legacyHomeProducts);
          hasCache = true;
          setHasProductsCache(true);
          setLoadingProducts(false);
          setIsHomeDataLoading(false);
        }
      }
    } catch (error) {
      console.error("讀取商品快取失敗", error);
    }

    refreshProductsFromXano({ hasCache });
    loadLookbooks({ hasCache: readHasHomeLookbooksCache() });
    loadHomeRankings({ hasCache: readHasHomeRankingsCache() });
  }, []);

  const loadLookbooks = async ({ hasCache = hasHomeLookbooksCache } = {}) => {
    if (!hasCache) {
      setIsLookbookLoading(true);
    }
    setLookbooksLoadError(false);

    try {
      const response = await fetchWithTimeout(`/api/lookbooks?t=${Date.now()}`, {}, 15000);
      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || `讀取 Lookbook 失敗：${response.status}`);
      }

      const rawList = Array.isArray(data.items) ? data.items : data.items?.items || [];
      const formattedLookbooks = formatLookbookList(rawList);

      saveHomeLookbooksCache(formattedLookbooks);
      setHasHomeLookbooksCache(true);
      setLookbooks(formattedLookbooks);
    } catch (error) {
      console.error("讀取 Lookbook 失敗", error);
      if (!hasCache) {
        setLookbooksLoadError(true);
      }
    } finally {
      setIsLookbookLoading(false);
    }
  };

  const createLookbook = async () => {
    if (!isAdmin) return;
    if (!lookbookForm.title || !lookbookForm.image || !lookbookForm.product_ids) {
      alert("請填寫 title、image、product_ids");
      return;
    }

    try {
      const url = editingLookbookId
        ? `${XANO_LOOKBOOKS_URL}/${editingLookbookId}`
        : XANO_LOOKBOOKS_URL;

      const response = await fetch(url, {
        method: editingLookbookId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: lookbookForm.title,
          image: lookbookForm.image,
          tag: lookbookForm.tag || "AI LOOKBOOK",
          gender: lookbookForm.gender || "unisex",
          product_ids: lookbookForm.product_ids,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${editingLookbookId ? "更新" : "新增"} Lookbook 失敗：${response.status}，${text}`);
      }

      setLookbookForm({ title: "", image: "", tag: "", gender: "unisex", product_ids: "" });
      setEditingLookbookId(null);
      await loadLookbooks();
      alert(editingLookbookId ? "Lookbook 已更新" : "Lookbook 已新增");
    } catch (error) {
      console.error(error);
      alert(error.message || `${editingLookbookId ? "更新" : "新增"} Lookbook 失敗`);
    }
  };

  const startEditLookbook = (lookbook) => {
    setEditingLookbookId(lookbook.id);
    setLookbookForm({
      title: lookbook.title || "",
      image: lookbook.image || "",
      tag: lookbook.tag || "",
      gender: lookbook.gender || "unisex",
      product_ids: lookbook.raw_product_ids || lookbook.product_ids?.join(",") || "",
    });
  };

  const cancelEditLookbook = () => {
    setEditingLookbookId(null);
    setLookbookForm({ title: "", image: "", tag: "", gender: "unisex", product_ids: "" });
  };

  const deleteLookbook = async (lookbookId) => {
    if (!isAdmin) return;
    if (!confirm("確定要刪除這張 Lookbook 嗎？")) return;

    try {
      const response = await fetch(`${XANO_LOOKBOOKS_URL}/${lookbookId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`刪除 Lookbook 失敗：${response.status}，${text}`);
      }

      await loadLookbooks();
    } catch (error) {
      console.error(error);
      alert(error.message || "刪除 Lookbook 失敗");
    }
  };

  const resetProductForm = () => {
    setProductForm({
      name: "",
      brand: "",
      jpy_price: "",
      image: "",
      images: "",
      colors: "",
      sizes: "",
      variants: "",
      gender: "unisex",
      tag: "日本選品",
      description: "",
      material: "",
      fit: "",
      model_height: "",
      model_weight: "",
      model_size: "",
      size_chart: "",
    });
    setEditingProductId(null);
  };

  const productVariantsToText = (product) => {
    return (product.variants || [])
      .map((variant) => `${variant.color}:${(variant.sizes || []).map((size) => `${size.name}:${size.stock}`).join(",")}`)
      .join(";");
  };

  const handleSyncStock = (product) => {
    const sourceUrl = product.source_url || product.sourceUrl || product.url;

    if (!sourceUrl?.trim()) {
      console.log("SYNC PRODUCT MISSING SOURCE_URL", product);
      alert("此商品沒有來源網址，無法同步庫存");
      return;
    }

    const opened = openStockSync(sourceUrl, product.id);
    if (opened) {
      alert("已開啟 ZOZO 商品頁，請先選擇顏色，再按「同步目前顏色庫存」");
    }
  };

  const startEditProduct = (product) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name || "",
      brand: product.brand || "",
      jpy_price: String(product.jpyPrice || ""),
      image: product.image || "",
      images: (product.images || []).join(","),
      colors: (product.colors || []).join(","),
      sizes: (product.sizes || []).join(","),
      variants: productVariantsToText(product),
      gender: product.gender || "unisex",
      tag: product.tag || "日本選品",
      description: product.description || "",
      material: product.material || "",
      fit: product.fit || "",
      model_height: String(product.modelHeight || ""),
      model_weight: String(product.modelWeight || ""),
      model_size: product.modelSize || "",
      recommended_height: product.recommendedHeight || "",
      recommended_weight: product.recommendedWeight || "",
      size_chart: product.sizeChart || "",
    });
  };

  const recalculateAllProducts = async () => {
    if (!isAdmin) return;

    if (!confirm("確定要依照最新匯率重新計算全部商品價格嗎？")) return;

    try {
      const response = await fetch(XANO_RECALCULATE_PRODUCTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`重算價格失敗：${response.status}，${text}`);
      }

      await refreshProductsFromXano({ hasCache: true });
      alert("全部商品價格已重算");
    } catch (error) {
      console.error(error);
      alert(error.message || "重算價格失敗");
    }
  };

  const createProduct = async () => {
    if (!isAdmin) return;

    if (!productForm.name || !productForm.brand || !productForm.jpy_price || !productForm.image || !productForm.variants) {
      alert("請至少填寫商品名稱、品牌、日幣價格、主圖、variants");
      return;
    }

    try {
      const payload = {
        product_id: editingProductId,
        name: productForm.name,
        brand: productForm.brand,
        jpy_price: Number(productForm.jpy_price),
        image: productForm.image,
        images: productForm.images || productForm.image,
        colors: productForm.colors,
        sizes: productForm.sizes,
        variants: productForm.variants,
        gender: productForm.gender,
        tag: productForm.tag || "日本選品",
        description: productForm.description,
        material: productForm.material,
        fit: productForm.fit,
        model_height: Number(productForm.model_height || 0),
        model_weight: Number(productForm.model_weight || 0),
        model_size: productForm.model_size,
        recommended_height: productForm.recommended_height,
        recommended_weight: productForm.recommended_weight,
        size_chart: productForm.size_chart,
      };

      const response = await fetch(editingProductId ? XANO_ADMIN_UPDATE_PRODUCT_URL : XANO_ADMIN_CREATE_PRODUCT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${editingProductId ? "更新" : "新增"}商品失敗：${response.status}，${text}`);
      }

      try {
        await fetch(XANO_RECALCULATE_PRODUCTS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (recalculateError) {
        console.error("重算商品價格失敗", recalculateError);
      }

      resetProductForm();
      await refreshProductsFromXano({ hasCache: true });
      alert(editingProductId ? "商品已更新" : "商品已新增");
    } catch (error) {
      console.error(error);
      alert(error.message || `${editingProductId ? "更新" : "新增"}商品失敗`);
    }
  };

  const deleteProduct = async (productId) => {
    if (!isAdmin) return;
    if (!confirm("確定要刪除這個商品嗎？刪除後前台會看不到。")) return;

    try {
      const response = await fetch(XANO_ADMIN_DELETE_PRODUCT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`刪除商品失敗：${response.status}，${text}`);
      }

      if (selectedProduct?.id === productId) {
        setSelectedProduct(null);
      }

      await refreshProductsFromXano({ hasCache: true });
      alert("商品已刪除");
    } catch (error) {
      console.error(error);
      alert(error.message || "刪除商品失敗");
    }
  };

  const catalogFilteredProducts = products.filter((product) => {
    const genderMatched =
      activeGender === "all" ? true : product.gender === activeGender;

    const brandMatched = activeBrand === "all" || product.brand === activeBrand;

    return genderMatched && brandMatched;
  });

  const filteredProducts = filterProductsBySearch(catalogFilteredProducts, shopSearchQuery);

  const favoriteProducts = useMemo(
    () => products.filter((product) => isFavoriteProduct(favoriteIds, product.id)),
    [products, favoriteIds]
  );

  const favoriteLookbooks = useMemo(
    () => lookbooks.filter((lookbook) => isFavoriteLookbook(favoriteLookbookIds, lookbook.id)),
    [lookbooks, favoriteLookbookIds]
  );

  const topSalesProducts = useMemo(() => {
    return salesRankings
      .map((entry, index) => {
        const product = products.find((item) => Number(item.id) === Number(entry.product_id));
        if (!product) {
          return null;
        }

        return {
          ...product,
          rank: index + 1,
          soldCount: Number(entry.total_qty) || 0,
        };
      })
      .filter(Boolean);
  }, [salesRankings, products]);

  const topFavoriteProducts = useMemo(
    () => parseRankingItems(favoriteProductRankings)
      .map((entry, index) => {
        const item = entry && typeof entry === "object" ? entry : {};
        const productId = Number(item.id ?? item.product_id);
        const localProduct = products.find((product) => Number(product.id) === productId);

        if (!localProduct && !item.name) {
          return null;
        }

        return {
          ...(localProduct || {
            id: productId,
            name: item.name || "",
            brand: item.brand || "",
            price: item.price || 0,
            image: item.image || "",
            tag: item.tag || "日本選品",
          }),
          rank: index + 1,
          favoriteCount: Number(item.favorite_count ?? item.favoriteCount ?? localProduct?.favoriteCount ?? 0) || 0,
        };
      })
      .filter(Boolean),
    [favoriteProductRankings, products]
  );

  const topFavoriteLookbooks = useMemo(
    () => parseRankingItems(favoriteLookbookRankings)
      .map((entry, index) => {
        const item = entry && typeof entry === "object" ? entry : {};
        const lookbookId = Number(item.id ?? item.lookbook_id);
        const localLookbook = lookbooks.find((lookbook) => Number(lookbook.id) === lookbookId);

        if (!localLookbook && !item.title) {
          return null;
        }

        return {
          ...(localLookbook || {
            id: lookbookId,
            title: item.title || "J-GO Lookbook",
            image: item.image || "",
            tag: item.tag || item.style_tag || "AI LOOKBOOK",
            gender: item.gender || "unisex",
            product_ids: Array.isArray(item.product_ids) ? item.product_ids : [],
          }),
          rank: index + 1,
          favoriteCount: Number(item.favorite_count ?? item.favoriteCount ?? localLookbook?.favoriteCount ?? 0) || 0,
        };
      })
      .filter(Boolean),
    [favoriteLookbookRankings, lookbooks]
  );

  const toggleFavorite = (productId) => {
    setFavoriteIds((prev) => {
      const id = Number(productId);
      const isAdding = !prev.includes(id);
      const next = toggleFavoriteId(prev, productId);

      if (isAdding) {
        const product = products.find((item) => Number(item.id) === id);
        trackFavoriteProduct({
          id: product?.id ?? productId,
          name: product?.name,
          brand: product?.brand,
          price: product?.price,
        });
        void syncProductFavoriteCount(id, "add");
        setProducts((prev) => prev.map((item) => (
          item.id === id
            ? { ...item, favoriteCount: Math.max(0, Number(item.favoriteCount || 0) + 1) }
            : item
        )));
      } else {
        void syncProductFavoriteCount(id, "remove");
        setProducts((prev) => prev.map((item) => (
          item.id === id
            ? { ...item, favoriteCount: Math.max(0, Number(item.favoriteCount || 0) - 1) }
            : item
        )));
      }

      saveFavoriteIds(next);
      return next;
    });
  };

  const toggleFavoriteLookbook = (lookbookId) => {
    setFavoriteLookbookIds((prev) => {
      const id = Number(lookbookId);
      const isAdding = !prev.includes(id);
      const next = toggleFavoriteLookbookId(prev, lookbookId);

      if (isAdding) {
        const lookbook = lookbooks.find((item) => Number(item.id) === id);
        trackFavoriteLookbook({
          id: lookbook?.id ?? lookbookId,
          title: lookbook?.title,
          tag: lookbook?.tag,
        });
        void syncLookbookFavoriteCount(id, "add");
        setLookbooks((prev) => prev.map((item) => (
          item.id === id
            ? { ...item, favoriteCount: Math.max(0, Number(item.favoriteCount || 0) + 1) }
            : item
        )));
      } else {
        void syncLookbookFavoriteCount(id, "remove");
        setLookbooks((prev) => prev.map((item) => (
          item.id === id
            ? { ...item, favoriteCount: Math.max(0, Number(item.favoriteCount || 0) - 1) }
            : item
        )));
      }

      saveFavoriteLookbookIds(next);
      return next;
    });
  };

  const loadHomeRankings = async ({ hasCache = hasHomeRankingsCache } = {}) => {
    if (!hasCache) {
      setIsRankingLoading(true);
      setIsFavoriteProductsRankingLoading(true);
      setIsFavoriteLookbooksRankingLoading(true);
    }

    setRankingLoadError(false);
    setFavoriteProductsRankingError(false);
    setFavoriteLookbooksRankingError(false);

    let nextSalesRankings = salesRankings;
    let nextFavoriteProductRankings = favoriteProductRankings;
    let nextFavoriteLookbookRankings = favoriteLookbookRankings;
    let salesOk = false;
    let favoriteProductsOk = false;
    let favoriteLookbooksOk = false;

    try {
      const [salesResponse, favoriteProductsResponse, favoriteLookbooksResponse] = await Promise.all([
        fetchWithTimeout("/api/rankings/sales?limit=10&period=week", {}, 15000),
        fetchWithTimeout("/api/rankings/favorites?limit=10", {}, 15000),
        fetchWithTimeout("/api/rankings/lookbooks?limit=10", {}, 15000),
      ]);

      try {
        const data = await salesResponse.json();
        const items = parseRankingItems(data.rankings ? { items: data.rankings } : data);

        if (!salesResponse.ok || data.success === false) {
          throw new Error(data.message || `讀取銷售排行失敗：${salesResponse.status}`);
        }

        nextSalesRankings = items;
        setSalesRankings(items);
        salesOk = true;
      } catch (error) {
        console.error("讀取銷售排行失敗", error);
        if (!hasCache) {
          setRankingLoadError(true);
        }
      }

      try {
        const data = await favoriteProductsResponse.json();
        const items = parseRankingItems(data);

        if (!favoriteProductsResponse.ok || data.success === false) {
          throw new Error(data.message || `讀取商品收藏排行失敗：${favoriteProductsResponse.status}`);
        }

        nextFavoriteProductRankings = items;
        setFavoriteProductRankings(items);
        favoriteProductsOk = true;
      } catch (error) {
        console.error("讀取商品收藏排行失敗", error);
        if (!hasCache) {
          setFavoriteProductsRankingError(true);
        }
      }

      try {
        const data = await favoriteLookbooksResponse.json();
        const items = parseRankingItems(data);

        if (!favoriteLookbooksResponse.ok || data.success === false) {
          throw new Error(data.message || `讀取穿搭收藏排行失敗：${favoriteLookbooksResponse.status}`);
        }

        nextFavoriteLookbookRankings = items;
        setFavoriteLookbookRankings(items);
        favoriteLookbooksOk = true;
      } catch (error) {
        console.error("讀取穿搭收藏排行失敗", error);
        if (!hasCache) {
          setFavoriteLookbooksRankingError(true);
        }
      }

      if (salesOk || favoriteProductsOk || favoriteLookbooksOk) {
        const existingRankings = readHomeRankingsCache() || {
          salesRankings: [],
          favoriteProductRankings: [],
          favoriteLookbookRankings: [],
        };

        saveHomeRankingsCache({
          salesRankings: salesOk ? nextSalesRankings : existingRankings.salesRankings,
          favoriteProductRankings: favoriteProductsOk
            ? nextFavoriteProductRankings
            : existingRankings.favoriteProductRankings,
          favoriteLookbookRankings: favoriteLookbooksOk
            ? nextFavoriteLookbookRankings
            : existingRankings.favoriteLookbookRankings,
        });
        setHasHomeRankingsCache(true);
      }
    } catch (error) {
      console.error("讀取首頁排行失敗", error);
      if (!hasCache) {
        setRankingLoadError(true);
        setFavoriteProductsRankingError(true);
        setFavoriteLookbooksRankingError(true);
      }
    } finally {
      setIsRankingLoading(false);
      setIsFavoriteProductsRankingLoading(false);
      setIsFavoriteLookbooksRankingLoading(false);
    }
  };

  const loadSalesRankings = async (options = {}) => loadHomeRankings(options);
  const loadFavoriteProductRankings = async (options = {}) => loadHomeRankings(options);
  const loadFavoriteLookbookRankings = async (options = {}) => loadHomeRankings(options);

  const runPrelaunchChecklist = async () => {
    setPrelaunchLoading(true);
    try {
      const results = await runPrelaunchChecks({ lookbooksUrl: XANO_LOOKBOOKS_URL });
      setPrelaunchChecks(results);
    } finally {
      setPrelaunchLoading(false);
    }
  };

  const brandOptions = ["all", ...Array.from(new Set(products.map((product) => product.brand).filter(Boolean)))];
  const homeBrandOptions = brandOptions.filter((brand) => brand !== "all").slice(0, 8);
  const featuredProduct = catalogFilteredProducts[0] || products[0];

  const shipping = subtotal > 0 ? 60 : 0;
  const total = subtotal + shipping;

  useEffect(() => {
    if (!mounted) return;

    if (tab === "home") {
      trackHomeView();
    }
  }, [mounted, tab]);

  useEffect(() => {
    if (!mounted || tab !== "product" || !selectedProduct) return;

    trackProductView({
      id: selectedProduct.id,
      name: selectedProduct.name,
      brand: selectedProduct.brand,
      price: selectedProduct.price,
    });
  }, [mounted, tab, selectedProduct?.id]);

  useEffect(() => {
    if (tab !== "checkout") {
      checkoutTrackedRef.current = false;
      return;
    }

    if (!mounted || cart.length === 0 || checkoutTrackedRef.current) {
      return;
    }

    checkoutTrackedRef.current = true;
    trackBeginCheckout(
      cart.map((item) => ({
        id: item.id,
        name: item.name,
        brand: item.brand,
        price: item.price,
        quantity: item.qty,
        color: item.color,
        size: item.size,
      })),
      total
    );
  }, [mounted, tab, cart, total]);

  useEffect(() => {
    if (!mounted || tab !== "shop") return;

    const term = shopSearchQuery.trim();
    if (!term) return;

    const timer = window.setTimeout(() => {
      trackSearchProducts(term);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [mounted, tab, shopSearchQuery]);

  const openProduct = (product) => {
    const colorOptions = getProductColorOptions(product);
    const initialColor = product.variants?.[0]?.color || colorOptions[0] || "";
    const sizeOptions = getSizeOptionsForColor(product, initialColor);
    setSelectedProduct(product);
    setSelectedColor(initialColor);
    setSelectedSize(
      findFirstSelectableSize(sizeOptions)?.name
      || sizeOptions[0]?.name
      || getProductSizeNames(product)[0]
      || ""
    );
    setSelectedImageIndex(0);
    setSizeAIResult(null);
    setTab("product");
  };

  const handleRecommendSize = () => {
    if (!selectedProduct) {
      return;
    }

    setSizeAIResult(
      buildSizeRecommendation(selectedProduct, sizeAI, getAvailableSizeNames(selectedProduct))
    );
  };

  const openBrandShop = (brand) => {
    if (!brand?.trim()) return;
    trackBrandClick(brand);
    setActiveBrand(brand);
    setActiveGender("all");
    setShopSearchQuery("");
    setTab("shop");
  };

  const requireLogin = (targetTab = "account") => {
    alert("請先登入會員");
    setTab(targetTab);
    return false;
  };

  const addToCart = () => {
    if (!isSignedIn || !currentUser) return requireLogin();

    const selectedSizeOption = getVariantForColorAndSize(selectedProduct, selectedColor, selectedSize);

    if (selectedSizeOption?.stock_status === "out_of_stock") {
      alert("此尺寸已售完");
      return;
    }

    if (!selectedSize) {
      alert("請選擇尺寸");
      return;
    }

    const selectedSizeStock = getSizeStockQty(selectedSizeOption);
    if (selectedSizeStock <= 0) {
      alert("這個顏色 / 尺寸目前缺貨");
      return;
    }

    if (selectedSizeOption?.stock_status === "unknown") {
      alert("此商品庫存需確認，下單後我們會為你確認庫存");
    }

    const key = `${selectedProduct.id}-${selectedColor}-${selectedSize}`;
    setCart((prev) => {
      const exists = prev.find((item) => item.key === key);
      if (exists) {
        if (exists.qty >= selectedSizeStock) {
          alert(`庫存只剩 ${selectedSizeStock} 件`);
          return prev;
        }
        return prev.map((item) => item.key === key ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { key, ...selectedProduct, color: selectedColor, size: selectedSize, stock: selectedSizeStock, qty: 1 }];
    });
    trackAddToCart([{
      id: selectedProduct.id,
      name: selectedProduct.name,
      brand: selectedProduct.brand,
      price: selectedProduct.price,
      quantity: 1,
      color: selectedColor,
      size: selectedSize,
    }]);
    setTab("cart");
  };

  const getLookbookProducts = (lookbook) => {
    if (!lookbook?.product_ids?.length) return [];
    return products.filter((product) => lookbook.product_ids.includes(Number(product.id)));
  };

  const getDefaultOutfitSelection = (product) => {
    const firstColor = product?.variants?.[0]?.color || getProductColorOptions(product)[0] || "";
    const sizeOptions = getSizeOptionsForColor(product, firstColor);
    const firstSelectableSize = findFirstSelectableSize(sizeOptions);

    return {
      color: firstColor,
      size: firstSelectableSize?.name || getProductSizeNames(product)[0] || "",
    };
  };

  const openOutfitBuilder = (lookbook) => {
    const relatedProducts = getLookbookProducts(lookbook);

    if (relatedProducts.length === 0) {
      alert("這套穿搭還沒有綁定商品");
      return;
    }

    const nextSelections = {};
    relatedProducts.forEach((product) => {
      nextSelections[product.id] = getDefaultOutfitSelection(product);
    });

    setSelectedLookbook(lookbook);
    setOutfitSelections(nextSelections);
    setTab("outfit-builder");
  };

  const updateOutfitSelection = (productId, patch) => {
    setOutfitSelections((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        ...patch,
      },
    }));
  };

  const getProductSizeOptionsByColor = (product, color) => getSizeOptionsForColor(product, color);

  const addOutfitSelectionsToCart = () => {
    if (!isSignedIn || !currentUser) return requireLogin();

    const relatedProducts = getLookbookProducts(selectedLookbook);

    if (relatedProducts.length === 0) {
      alert("這套穿搭還沒有綁定商品");
      return;
    }

    const nextItems = [];
    let hasUnknownStock = false;

    for (const product of relatedProducts) {
      const selection = outfitSelections[product.id] || {};
      const color = selection.color;
      const size = selection.size;
      const sizeOptions = getProductSizeOptionsByColor(product, color);
      const selectedSizeOption = getVariantForColorAndSize(product, color, size) || sizeOptions.find((item) => item.name === size);
      const stock = getSizeStockQty(selectedSizeOption);

      if (!color || !size) {
        alert(`請先選擇「${product.name}」的顏色與尺寸`);
        return;
      }

      if (selectedSizeOption?.stock_status === "out_of_stock") {
        alert(`「${product.name}」${color} / ${size} 此尺寸已售完`);
        return;
      }

      if (selectedSizeOption?.stock_status === "unknown") {
        hasUnknownStock = true;
      }

      nextItems.push({
        key: `${product.id}-${color}-${size}`,
        ...product,
        color,
        size,
        stock,
        qty: 1,
      });
    }

    if (hasUnknownStock) {
      alert("此商品庫存需確認，下單後我們會為你確認庫存");
    }

    setCart((prev) => {
      let nextCart = [...prev];

      nextItems.forEach((newItem) => {
        const exists = nextCart.find((item) => item.key === newItem.key);
        if (exists) {
          nextCart = nextCart.map((item) => (
            item.key === newItem.key
              ? { ...item, qty: Math.min(Number(item.stock ?? 999), item.qty + 1) }
              : item
          ));
        } else {
          nextCart.push(newItem);
        }
      });

      return nextCart;
    });

    trackAddToCart(nextItems.map((item) => ({
      id: item.id,
      name: item.name,
      brand: item.brand,
      price: item.price,
      quantity: 1,
      color: item.color,
      size: item.size,
    })));

    alert(`已加入 ${nextItems.length} 件穿搭商品到購物車`);
    setTab("cart");
  };

  const updateQty = (key, delta) => {
    setCart((prev) => prev
      .map((item) => {
        if (item.key !== key) return item;
        const nextQty = Math.max(1, item.qty + delta);
        if (nextQty > item.stock) {
          alert(`庫存只剩 ${item.stock} 件`);
          return item;
        }
        return { ...item, qty: nextQty };
      })
    );
  };

  const removeItem = (key) => setCart((prev) => prev.filter((item) => item.key !== key));

  const productImages = selectedProduct?.images?.length ? selectedProduct.images : [selectedProduct?.image].filter(Boolean);

  const availableSizeOptions = selectedProduct
    ? getSizeOptionsForColor(selectedProduct, selectedColor)
    : [];

  const availableSizes = availableSizeOptions.map((size) => size.name);
  const selectedSizeOption = getVariantForColorAndSize(selectedProduct, selectedColor, selectedSize);
  const selectedProductDescription = selectedProduct ? getProductDescription(selectedProduct) : "";
  const colorStockMaps = selectedProduct ? getColorStockMaps(selectedProduct) : { statusMap: {}, stockMap: {} };
  const productFeatureText = buildProductFeatureText(selectedProduct, selectedProductDescription);
  const productSizeInfoText = buildProductSizeInfoText(selectedProduct);
  const brandIntroText = buildBrandIntroText(selectedProduct);

  useEffect(() => {
    setSizeAIResult(null);
  }, [selectedProduct?.id]);

  const goToPrevImage = () => {
    if (productImages.length <= 1) return;
    setSelectedImageIndex((prev) => (prev - 1 + productImages.length) % productImages.length);
  };

  const goToNextImage = () => {
    if (productImages.length <= 1) return;
    setSelectedImageIndex((prev) => (prev + 1) % productImages.length);
  };

  const handleImageTouchStart = (event) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const handleImageTouchEnd = (event) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - event.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      diff > 0 ? goToNextImage() : goToPrevImage();
    }
    touchStartX.current = null;
  };

  const loginWithGoogle = () => {
    const user = { name: "J-GO 會員", email: "demo@gmail.com", phone: "0912345678", provider: "Google" };
    setCurrentUser(user);
    localStorage.setItem("jgo_current_user", JSON.stringify(user));
    setAccountForm({ name: user.name, email: user.email, phone: user.phone });
    setCheckoutForm({ name: user.name, email: user.email, phone: user.phone });
    setTab("account");
  };

  const submitAuth = () => {
    const user = {
      name: authForm.name || "J-GO 會員",
      email: authForm.email || "demo@example.com",
      phone: authForm.phone || "0912345678",
      provider: authMode === "register" ? "Email 註冊" : "Email 登入",
    };
    setCurrentUser(user);
    localStorage.setItem("jgo_current_user", JSON.stringify(user));
    setAccountForm({ name: user.name, email: user.email, phone: user.phone });
    setCheckoutForm({ name: user.name, email: user.email, phone: user.phone });
    setTab("account");
  };

  const saveAccount = () => {
    const updatedUser = {
      ...currentUser,
      name: accountForm.name || "J-GO 會員",
      email: accountForm.email || "demo@example.com",
      phone: accountForm.phone || "0912345678",
    };
    setCurrentUser(updatedUser);
    localStorage.setItem("jgo_current_user", JSON.stringify(updatedUser));
    setCheckoutForm({ name: updatedUser.name, email: updatedUser.email, phone: updatedUser.phone });
    alert("帳號資料已更新");
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem("jgo_current_user");
    setCart([]);
    setOrders([]);
    setCheckoutForm({ name: "", email: "", phone: "" });
    setAccountForm({ name: "", email: "", phone: "" });
    setTab("account");
  };

  const getUserOrderKey = (user) => user?.email || "guest";

  const saveOrderForUser = (user, newOrder) => {
    const key = getUserOrderKey(user);
    const savedOrders = JSON.parse(localStorage.getItem("jgo_orders_by_user") || "{}");
    const nextOrders = [newOrder, ...(savedOrders[key] || [])];
    savedOrders[key] = nextOrders;
    localStorage.setItem("jgo_orders_by_user", JSON.stringify(savedOrders));
    setOrders(nextOrders);
  };

  const loadOrdersForUser = async (user) => {
    if (ordersLoadingRef.current) return;

    if (!user?.email) {
      setOrders([]);
      return;
    }

    const orderCacheKey = `jgo_orders_cache_${user.email}`;
    const cachedOrders = localStorage.getItem(orderCacheKey);
    if (cachedOrders) {
      const parsedOrders = JSON.parse(cachedOrders);
      if (Array.isArray(parsedOrders)) {
        setOrders(parsedOrders);
      }
    }

    ordersLoadingRef.current = true;

    try {
      const response = await fetch(`${XANO_GET_ORDERS_URL}?customer_email=${encodeURIComponent(user.email)}`);

      if (!response.ok) {
        throw new Error(`讀取訂單失敗：${response.status}`);
      }

      const data = await response.json();
      const xanoOrders = Array.isArray(data) ? data : data?.items || [];

      xanoOrders.sort((a, b) => Number(b.created_at) - Number(a.created_at));

      const recentOrders = xanoOrders.slice(0, 10);

      const formattedOrders = await Promise.all(
        recentOrders.map(async (order) => {
          let items = [];

          try {
            const itemsResponse = await fetch(`${XANO_GET_ORDER_ITEMS_URL}?order_id=${order.id}`);
            if (itemsResponse.ok) {
              const itemsData = await itemsResponse.json();
              items = Array.isArray(itemsData) ? itemsData : itemsData?.items || [];
            }
          } catch (error) {
            console.error("讀取訂單明細失敗", error);
          }

          return {
            id: order.id,
            items,
            total: order.total_price || 0,
            delivery: order.delivery_method || "711",
            pickupStore: {
              store_name: order.pickup_store_name || "",
              store_id: order.pickup_store_code || "",
              address: order.pickup_store_address || "",
            },
            shippingAddress: {
              city: order.home_city || "",
              district: order.home_district || "",
              address: order.home_address || "",
            },
            status: order.payment_status || "Pending",
            shippingStatus: order.shipping_status || (order.payment_status === "Paid" ? "待出貨" : "未付款"),
            trackingNo: order.tracking_no || "",
            shippingCompany: order.shipping_company || "",
            shippedAt: order.shipped_at || "",
            createdAt: order.created_at ? new Date(Number(order.created_at)).toLocaleString("zh-TW") : ""
          };
        })
      );

      localStorage.setItem(orderCacheKey, JSON.stringify(formattedOrders));
      setOrders(formattedOrders);
    } catch (error) {
      console.error(error);
      if (!String(error.message || "").includes("429")) {
        alert(error.message);
      }
    } finally {
      ordersLoadingRef.current = false;
    }
  };

  const loadAllOrdersForAdmin = async () => {
    if (!isAdmin) return;

    try {
      const response = await fetch(`${XANO_ADMIN_ORDERS_URL}?t=${Date.now()}`);

      if (!response.ok) {
        throw new Error(`讀取全部訂單失敗：${response.status}`);
      }

      const data = await response.json();
      const allOrders = Array.isArray(data.orders)
        ? data.orders
        : Array.isArray(data)
          ? data
          : [];

      const formattedOrders = await Promise.all(
        allOrders.map(async (order) => {
          let items = [];

          try {
            const itemsResponse = await fetch(`${XANO_GET_ORDER_ITEMS_URL}?order_id=${order.id}`);

            if (itemsResponse.ok) {
              const itemsData = await itemsResponse.json();
              items = Array.isArray(itemsData) ? itemsData : itemsData?.items || [];
            }
          } catch (error) {
            console.error("讀取訂單商品失敗", error);
          }

          return {
            id: order.id,
            items,
            total: order.total_price || 0,
            delivery: order.delivery_method || "711",
            pickupStore: {
              store_name: order.pickup_store_name || "",
              store_id: order.pickup_store_code || "",
              address: order.pickup_store_address || "",
            },
            shippingAddress: {
              city: order.home_city || "",
              district: order.home_district || "",
              address: order.home_address || "",
            },
            status: order.payment_status || "Pending",
            shippingStatus: order.shipping_status || "待出貨",
            trackingNo: order.tracking_no || "",
            shippingCompany: order.shipping_company || "",
            shippedAt: order.shipped_at || "",
            customerName: order.customer_name || "",
            customerEmail: order.customer_email || "",
            createdAt: order.created_at
              ? new Date(Number(order.created_at)).toLocaleString("zh-TW")
              : "",
          };
        })
      );

      formattedOrders.sort((a, b) => Number(b.id) - Number(a.id));

      setOrders(formattedOrders);
    } catch (error) {
      console.error(error);
      alert(error.message || "讀取全部訂單失敗");
    }
  };

  const updateOrderShippingStatus = async (orderId, nextStatus) => {
    if (!isAdmin) return;

    try {
      const response = await fetch(XANO_UPDATE_ORDER_SHIPPING_STATUS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          shipping_status: nextStatus,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`更新出貨狀態失敗：${response.status}，${text}`);
      }

      setOrders((prev) => prev.map((order) => order.id === orderId ? { ...order, shippingStatus: nextStatus } : order));
      setSelectedOrder((prev) => prev?.id === orderId ? { ...prev, shippingStatus: nextStatus } : prev);
      alert(`訂單已更新為：${nextStatus}`);
    } catch (error) {
      console.error(error);
      alert(error.message || "更新出貨狀態失敗");
    }
  };


  const updateTrackingForm = (orderId, field, value) => {
    setTrackingForms((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {}),
        [field]: value,
      },
    }));
  };

  const saveOrderShipping = async (order) => {
    if (!isAdmin) return;

    const form = trackingForms[order.id] || {};
    const trackingNo = (form.trackingNo ?? order.trackingNo ?? "").trim();
    const shippingCompany = (form.shippingCompany ?? order.shippingCompany ?? "").trim();
    const shippedAtInput = form.shippedAt ?? toDatetimeLocalValue(order.shippedAt) ?? toDatetimeLocalValue(Date.now());
    const shipped_at = toIsoDateTime(shippedAtInput);

    if (!trackingNo) {
      alert("請輸入物流單號");
      return;
    }

    if (!shippingCompany) {
      alert("請輸入物流公司，例如 7-ELEVEN、全家、黑貓");
      return;
    }

    try {
      const response = await fetch("/api/admin/orders/shipping", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.id,
          tracking_no: trackingNo,
          shipping_company: shippingCompany,
          shipped_at,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "更新物流失敗");
      }

      const nextShippedAt = data.shipped_at || shipped_at;

      setOrders((prev) => prev.map((item) => item.id === order.id ? {
        ...item,
        trackingNo,
        shippingCompany,
        shippedAt: nextShippedAt,
        shippingStatus: "已出貨",
      } : item));

      setSelectedOrder((prev) => prev?.id === order.id ? {
        ...prev,
        trackingNo,
        shippingCompany,
        shippedAt: nextShippedAt,
        shippingStatus: "已出貨",
      } : prev);

      setTrackingForms((prev) => ({
        ...prev,
        [order.id]: { trackingNo, shippingCompany, shippedAt: toDatetimeLocalValue(nextShippedAt) },
      }));

      alert("出貨資訊已儲存");
    } catch (error) {
      console.error(error);
      alert(error.message || "更新物流失敗");
    }
  };

  const submitOrder = async () => {
    if (isSubmitting) return;
    if (!isSignedIn || !currentUser) return requireLogin();
    if (cart.length === 0) return;

    if (!checkoutForm.name || !checkoutForm.email || !checkoutForm.phone) {
      alert("請先填寫結帳姓名、Email 和手機號碼");
      return;
    }

    if (delivery === "711" && (!pickupStore.store_name || !pickupStore.store_id || !pickupStore.address)) {
      alert("請先選擇 7-11 門市");
      return;
    }

    if (delivery === "home" && (!shippingAddress.city || !shippingAddress.district || !shippingAddress.address)) {
      alert("請先填寫完整宅配地址");
      return;
    }

    if (XANO_CHECKOUT_URL.includes("請貼上")) {
      alert("請先把 XANO_CHECKOUT_URL 換成你的 Xano /checkout API URL");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(XANO_CHECKOUT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_name: checkoutForm.name,
          customer_email: checkoutForm.email,
          customer_phone: checkoutForm.phone,
          delivery_method: delivery,
          total_price: total,
          pickup_store_name: pickupStore.store_name,
          pickup_store_code: pickupStore.store_id,
          pickup_store_address: pickupStore.address,
          home_city: shippingAddress.city,
          home_district: shippingAddress.district,
          home_address: shippingAddress.address,
        }),
      });

      if (!response.ok) {
        throw new Error(`Checkout failed: ${response.status}`);
      }

      const data = await response.json();
      console.log("checkout response", data);

      const ecpayResponse = await fetch(XANO_CREATE_ECPAY_ORDER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: data.id,
          customer_name: checkoutForm.name,
          customer_email: checkoutForm.email,
          total_price: total,
        }),
      });

      if (!ecpayResponse.ok) {
        throw new Error("建立綠界訂單失敗");
      }

      const ecpayData = await ecpayResponse.json();

      console.log("ecpay response", ecpayData);

      const orderId = data.id;

      if (!orderId) {
        throw new Error("Xano checkout 沒有回傳 order id");
      }

      console.log("準備送出 order_items", { orderId, cart });

      for (const item of cart) {
        console.log("送出單筆商品", {
          order_id: orderId,
          product_name: item.name || item.product_name || selectedProduct?.name || "JGO商品",
          color: item.color,
          size: item.size,
          qty: item.qty,
          unit_price: item.price,
          subtotal: item.price * item.qty,
        });

        const itemResponse = await fetch(XANO_ADD_ORDER_ITEM_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order_id: orderId,
            product_name: item.name || item.product_name || selectedProduct?.name || "JGO商品",
          color: item.color,
            size: item.size,
            qty: item.qty,
            unit_price: item.price,
            subtotal: item.price * item.qty,
          }),
        });

        const itemText = await itemResponse.text();
        let itemData = null;

        try {
          itemData = itemText ? JSON.parse(itemText) : null;
        } catch {
          itemData = itemText;
        }

        console.log("add order item response", itemResponse.status, itemData);

        if (!itemResponse.ok) {
          throw new Error(`新增商品明細失敗：${itemResponse.status}，${itemText}`);
        }

        const stockResponse = await fetch(XANO_DECREASE_STOCK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product_id: item.id,
            color: item.color,
            size: item.size,
            qty: item.qty,
          }),
        });

        const stockText = await stockResponse.text();
        let stockData = null;

        try {
          stockData = stockText ? JSON.parse(stockText) : null;
        } catch {
          stockData = stockText;
        }

        console.log("decrease stock response", stockResponse.status, stockData);

        if (!stockResponse.ok) {
          throw new Error(`扣庫存失敗：${stockResponse.status}，${stockText}`);
        }
      }

      await refreshProductsFromXano({ hasCache: true });

      const order = {
        id: orderId || `JG-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(orders.length + 1).padStart(4, "0")}`,
        items: cart.map((item) => ({
          id: item.key,
          product_name: item.name || item.product_name || selectedProduct?.name || "JGO商品",
          color: item.color,
          size: item.size,
          qty: item.qty,
          unit_price: item.price,
          subtotal: item.price * item.qty,
        })),
        total,
        delivery,
        pickupStore,
        shippingAddress,
        status: data.payment_status || "Pending",
        shippingStatus: "待出貨",
        trackingNo: "",
        shippingCompany: "",
        createdAt: new Date().toLocaleString("zh-TW"),
      };

      saveOrderForUser(currentUser, order);
      setCart([]);
      localStorage.removeItem("jgo_cart");

      const form = document.createElement("form");
      form.method = "POST";
      form.action = ecpayData.payment_url;

      Object.entries(ecpayData).forEach(([key, value]) => {
        if (key === "payment_url" || key === "merchant_trade_no") return;

        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      console.error(error);
      alert(`訂單建立失敗：${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };


  const normalizeText = (value) => String(value || "").trim().toLowerCase();

  const findLookbookByGender = (targetGender) => {
    const normalizedTarget = normalizeText(targetGender);
    return lookbooks.find((lookbook) => normalizeText(lookbook.gender) === normalizedTarget);
  };

  // 首頁圖片改成依照 Lookbook 的 gender 固定抓圖。
  // 你的 Xano Lookbook 目前只有 gender 欄位，所以不用建立 home_hero / home_male 這些 tag。
  // male / female / unisex 會各抓第一張對應性別的 Lookbook 圖；不再用 products[0] / products[1]，避免新增商品後跳圖。
  const maleLookbook = findLookbookByGender("male");
  const femaleLookbook = findLookbookByGender("female");
  const unisexLookbook = findLookbookByGender("unisex");

  const categoryMenImage = maleLookbook?.image || "";
  const categoryWomenImage = femaleLookbook?.image || "";
  const categoryUnisexImage = unisexLookbook?.image || "";
  const heroImage = maleLookbook?.image || femaleLookbook?.image || unisexLookbook?.image || lookbooks[0]?.image || "";

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white shadow-2xl">
        <header className="sticky top-0 z-10 border-b bg-white/90 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500">From Japan, To You</p>
              <h1 className="text-2xl font-black tracking-tight">J-GO</h1>
            </div>
            <div className="flex items-center gap-2">
            <button
              onClick={() => setTab("account")}
              className="rounded-full border border-neutral-200 p-3 text-neutral-700"
            >
              <User size={20} />
            </button>
            <button onClick={() => setTab("cart")} className="relative rounded-full bg-neutral-900 p-3 text-white">
              <ShoppingBag size={20} />
              {mounted && cartCount > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-xs">{cartCount}</span>
              )}
            </button>
          </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5 pb-24">
          {tab === "home" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <section className="space-y-4">
                <button
                  onClick={() => setTab("shop")}
                  className="flex w-full items-center gap-3 rounded-[1.7rem] bg-neutral-100 px-5 py-4 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <Search size={20} className="shrink-0 text-neutral-400" />
                  <span className="text-sm font-bold text-neutral-400">搜尋品牌、商品或穿搭靈感</span>
                </button>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: "male", title: "男生日系", sub: "SHOP MEN", image: categoryMenImage },
                    { key: "female", title: "女生日系", sub: "SHOP WOMEN", image: categoryWomenImage },
                    { key: "unisex", title: "中性穿搭", sub: "SHOP UNISEX", image: categoryUnisexImage },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        setActiveGender(item.key);
                        setActiveBrand("all");
                        setTab("shop");
                      }}
                      className="relative h-[82px] overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-white to-neutral-100 p-3 text-left shadow-[0_12px_30px_rgba(0,0,0,0.08)] ring-1 ring-neutral-100 transition active:scale-[0.98]"
                    >
                      {item.image && <img src={item.image} alt={item.title} className="absolute inset-y-0 right-0 h-full w-[82px] object-cover object-top opacity-90" />}
                      <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/10" />
                      <div className="relative z-10">
                        <p className="text-[15px] font-black leading-tight text-neutral-950">{item.title}</p>
                        <p className="mt-1 text-[9px] font-black tracking-[0.16em] text-neutral-400">{item.sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-3 gap-2">
                {HOME_TRUST_CARDS.map((item, index) => {
                  const Icon = index === 0 ? ShieldCheck : index === 1 ? Clock : Package;

                  return (
                    <div
                      key={item.key}
                      className="rounded-[1.4rem] bg-white p-3 text-center shadow-sm ring-1 ring-neutral-100"
                    >
                      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-white">
                        <Icon size={16} />
                      </div>
                      <p className="mt-2 text-[11px] font-black leading-tight text-neutral-900">{item.title}</p>
                      <p className="mt-1 text-[9px] font-bold leading-4 text-neutral-500">{item.description}</p>
                    </div>
                  );
                })}
              </section>

              <section className="relative h-[280px] overflow-hidden rounded-[2rem] bg-neutral-900 shadow-2xl sm:h-[320px]">
                <div className="absolute inset-0 grid grid-cols-2 bg-neutral-800">
                  {categoryMenImage && (
                    <img
                      src={categoryMenImage}
                      alt="male"
                      className="h-full w-full object-cover object-top"
                    />
                  )}

                  {categoryWomenImage && (
                    <img
                      src={categoryWomenImage}
                      alt="female"
                      className="h-full w-full object-cover object-top"
                    />
                  )}
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/30" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.18),transparent_30%)]" />

                <div className="relative z-10 flex h-full flex-col justify-between overflow-hidden px-4 py-4 text-white sm:px-6 sm:py-5">
                  <div className="flex justify-end">
                    <span className="rounded-full bg-neutral-950/90 px-3 py-1 text-[10px] font-black text-white shadow-lg backdrop-blur sm:px-4 sm:py-1.5">NEW DROP</span>
                  </div>

                  <div className="min-w-0 max-w-full pr-1">
                    <p className="text-xs font-black text-white/90 sm:text-sm">日系穿搭 × AI LOOKBOOK × 整套購買</p>
                    <h2 className="mt-2 break-words text-[1.85rem] font-black leading-[0.95] tracking-tight drop-shadow sm:text-[2.7rem]">
                      Find your<br />Japan fit.
                    </h2>
                    <p className="mt-2 max-w-full text-xs font-bold leading-5 text-white/90 sm:mt-4 sm:max-w-[260px] sm:text-sm sm:leading-6">
                      從 AI Lookbook 找靈感，依品牌、風格快速逛到整套穿搭。
                    </p>
                    <button onClick={() => setTab("lookbook")} className="mt-3 rounded-2xl bg-white px-5 py-2.5 text-xs font-black text-neutral-950 shadow-xl transition active:scale-[0.98] sm:mt-5 sm:px-7 sm:py-3 sm:text-sm">
                      探索穿搭靈感 →
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tight">本週熱門穿搭</h3>
                  <button onClick={() => setTab("lookbook")} className="text-xs font-black text-neutral-500">查看全部 ›</button>
                </div>

                {isLookbookLoading && !hasHomeLookbooksCache ? (
                  <HorizontalSkeletonCards count={4} className="h-[188px] w-[150px]" />
                ) : lookbooks.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
                    {lookbooks.slice(0, 4).map((lookbook, index) => (
                      <div key={lookbook.id} className="relative shrink-0">
                        <button
                          onClick={() => {
                            setSelectedLookbook(lookbook);
                            setTab("lookbook-detail");
                          }}
                          className="group relative min-w-[150px] w-[150px] overflow-hidden rounded-[28px] bg-neutral-100 text-left shadow-[0_14px_30px_rgba(0,0,0,0.1)] transition active:scale-[0.98]"
                        >
                          <div className="relative aspect-[4/5] w-full overflow-hidden bg-neutral-100">
                            <img
                              src={lookbook.image}
                              alt={lookbook.title}
                              className="h-full w-full object-contain object-center"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                            <span className="absolute left-3 top-3 rounded-full bg-neutral-950/90 px-2.5 py-1 text-[10px] font-black text-white">{String(index + 1).padStart(2, "0")}</span>
                            <div className="absolute bottom-3 left-3 right-3 text-white">
                              <p className="text-[15px] font-black leading-tight">{lookbook.tag || "STYLE"}</p>
                              <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-4 text-white/85">{lookbook.title}</p>
                              <span className="mt-3 inline-block rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-black text-neutral-900">查看整套</span>
                            </div>
                          </div>
                        </button>
                        <div className="absolute right-3 top-3 z-10">
                          <FavoriteHeartButton
                            isFavorite={isFavoriteLookbook(favoriteLookbookIds, lookbook.id)}
                            onToggle={() => toggleFavoriteLookbook(lookbook.id)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : lookbooksLoadError && !hasHomeLookbooksCache ? (
                  <HomeLoadingHint message="資料載入中，請稍候" />
                ) : !isLookbookLoading && !lookbooksLoadError ? (
                  <div className="rounded-[1.6rem] bg-neutral-50 p-5 text-sm font-bold text-neutral-400">
                    目前還沒有 Lookbook，新增後會自動出現在這裡。
                  </div>
                ) : null}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tight">熱門品牌</h3>
                  <button
                    onClick={() => {
                      setActiveBrand("all");
                      setTab("shop");
                    }}
                    className="text-xs font-black text-neutral-500"
                  >
                    查看全部品牌 ›
                  </button>
                </div>

                <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none]">
                  {homeBrandOptions.slice(0, 6).map((brand) => (
                    <button
                      key={brand}
                      onClick={() => openBrandShop(brand)}
                      className="min-w-[82px] text-center transition active:scale-[0.98]"
                    >
                      <div className="mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-br from-white to-neutral-100 px-2 text-center text-[11px] font-black leading-tight text-neutral-900 shadow-[0_12px_28px_rgba(0,0,0,0.08)] ring-1 ring-neutral-100">
                        <span className="max-w-[58px] whitespace-normal break-words">
                          {brand}
                        </span>
                      </div>
                      <p className="mx-auto mt-2 max-w-[78px] truncate text-[11px] font-bold text-neutral-500">
                        {brand}
                      </p>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setActiveBrand("all");
                      setTab("shop");
                    }}
                    className="min-w-[82px] text-center transition active:scale-[0.98]"
                  >
                    <div className="mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-br from-white to-neutral-100 text-2xl font-black text-neutral-400 shadow-[0_12px_28px_rgba(0,0,0,0.08)] ring-1 ring-neutral-100">▦</div>
                    <p className="mt-2 text-[11px] font-bold text-neutral-500">更多品牌</p>
                  </button>
                </div>
              </section>

              <section className="grid grid-cols-3 gap-3">
                {[
                  { title: "AI 尺寸推薦", text: "輸入身高體重，找出最適合你的尺寸", action: "立即推薦 →", image: products[0]?.image, tab: "shop" },
                  { title: "整套購買更優惠", text: "一鍵購買整套穿搭，享受組合優惠", action: "去逛逛 →", image: products[1]?.image || products[0]?.image, tab: "lookbook" },
                  { title: "日本流行情報", text: "掌握日本最新流行趨勢與選品更新", action: "查看趨勢 →", image: products[2]?.image || products[0]?.image, tab: "lookbook" },
                ].map((card) => (
                  <button
                    key={card.title}
                    onClick={() => setTab(card.tab)}
                    className="relative min-h-[118px] overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-neutral-50 to-white p-3 text-left shadow-[0_14px_30px_rgba(0,0,0,0.08)] ring-1 ring-neutral-100 transition active:scale-[0.98]"
                  >
                    {card.image && <img src={card.image} alt={card.title} className="absolute bottom-0 right-0 h-20 w-20 object-cover opacity-25" />}
                    <div className="relative z-10">
                      <p className="text-xs font-black leading-tight text-neutral-950">{card.title}</p>
                      <p className="mt-1 line-clamp-2 text-[10px] font-bold leading-4 text-neutral-500">{card.text}</p>
                      <span className="mt-3 inline-block rounded-full bg-neutral-950 px-2.5 py-1.5 text-[9px] font-black text-white">{card.action}</span>
                    </div>
                  </button>
                ))}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tight">本週熱賣商品</h3>
                  <button onClick={() => setTab("shop")} className="text-xs font-black text-neutral-500">看全部 ›</button>
                </div>
                {isRankingLoading && !hasHomeRankingsCache ? (
                  <HorizontalSkeletonCards count={3} className="h-[220px] w-[150px]" />
                ) : topSalesProducts.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
                    {topSalesProducts.map((product) => (
                      <RankingProductCard
                        key={`sales-${product.id}`}
                        product={product}
                        rank={product.rank}
                        metricLabel={`已售出 ${product.soldCount} 件`}
                        isFavorite={isFavoriteProduct(favoriteIds, product.id)}
                        onToggleFavorite={toggleFavorite}
                        onClick={() => openProduct(product)}
                        compact
                      />
                    ))}
                  </div>
                ) : rankingLoadError && !hasHomeRankingsCache ? (
                  <HomeLoadingHint message="資料載入中，請稍候" />
                ) : !isRankingLoading && !rankingLoadError ? (
                  <div className="rounded-[1.6rem] bg-neutral-50 p-5 text-sm font-bold text-neutral-400">
                    目前還沒有銷售排行資料。
                  </div>
                ) : null}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tight">人氣收藏商品</h3>
                  <button onClick={() => setTab("shop")} className="text-xs font-black text-neutral-500">看全部 ›</button>
                </div>
                {isFavoriteProductsRankingLoading && !hasHomeRankingsCache ? (
                  <HorizontalSkeletonCards count={3} className="h-[220px] w-[150px]" />
                ) : topFavoriteProducts.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
                    {topFavoriteProducts.map((product) => (
                      <RankingProductCard
                        key={`favorite-${product.id}`}
                        product={product}
                        rank={product.rank}
                        metricLabel={`收藏 ${product.favoriteCount || 0} 次`}
                        isFavorite={isFavoriteProduct(favoriteIds, product.id)}
                        onToggleFavorite={toggleFavorite}
                        onClick={() => openProduct(product)}
                        compact
                      />
                    ))}
                  </div>
                ) : favoriteProductsRankingError && !hasHomeRankingsCache ? (
                  <HomeLoadingHint message="資料載入中，請稍候" />
                ) : !isFavoriteProductsRankingLoading && !favoriteProductsRankingError ? (
                  <div className="rounded-[1.6rem] bg-neutral-50 p-5 text-sm font-bold text-neutral-400">
                    目前還沒有收藏排行資料。
                  </div>
                ) : null}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tight">人氣穿搭排行</h3>
                  <button onClick={() => setTab("lookbook")} className="text-xs font-black text-neutral-500">看全部 ›</button>
                </div>
                {isFavoriteLookbooksRankingLoading && !hasHomeRankingsCache ? (
                  <HorizontalSkeletonCards count={3} className="h-[220px] w-[150px]" />
                ) : topFavoriteLookbooks.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
                    {topFavoriteLookbooks.map((lookbook) => (
                      <RankingLookbookCard
                        key={`home-lookbook-rank-${lookbook.id}`}
                        lookbook={lookbook}
                        rank={lookbook.rank}
                        metricLabel={`收藏 ${lookbook.favoriteCount || 0} 次`}
                        isFavorite={isFavoriteLookbook(favoriteLookbookIds, lookbook.id)}
                        onToggleFavorite={toggleFavoriteLookbook}
                        onClick={() => {
                          setSelectedLookbook(lookbook);
                          setTab("lookbook-detail");
                        }}
                      />
                    ))}
                  </div>
                ) : favoriteLookbooksRankingError && !hasHomeRankingsCache ? (
                  <HomeLoadingHint message="資料載入中，請稍候" />
                ) : !isFavoriteLookbooksRankingLoading && !favoriteLookbooksRankingError ? (
                  <div className="rounded-[1.6rem] bg-neutral-50 p-5 text-sm font-bold text-neutral-400">
                    目前還沒有穿搭收藏排行資料。
                  </div>
                ) : null}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tight">新品上架</h3>
                  <button onClick={() => setTab("shop")} className="text-xs font-black text-neutral-500">看全部 ›</button>
                </div>
                {isHomeDataLoading && !hasProductsCache ? (
                  <ProductGridSkeleton count={4} />
                ) : catalogFilteredProducts.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {catalogFilteredProducts
                    .slice(0, 4)
                    .map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        isFavorite={isFavoriteProduct(favoriteIds, product.id)}
                        onToggleFavorite={toggleFavorite}
                        onClick={() => openProduct(product)}
                      />
                    ))}
                </div>
                ) : homeDataLoadError && !hasProductsCache ? (
                  <HomeLoadingHint message="資料載入中，請稍候" />
                ) : !isHomeDataLoading && !hasProductsCache && products.length === 0 ? (
                  <div className="rounded-[1.6rem] bg-neutral-50 p-5 text-sm font-bold text-neutral-400">
                    目前還沒有新品上架。
                  </div>
                ) : null}
              </section>
            </motion.div>
          )}

          {tab === "lookbook" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold tracking-widest text-neutral-400">STYLE FEED</p>
                  <h2 className="text-3xl font-black">AI 穿搭靈感</h2>
                </div>
                <Button onClick={loadLookbooks} className="rounded-2xl bg-neutral-900 text-sm">刷新</Button>
              </div>

              <div className="grid grid-cols-4 gap-2 rounded-2xl bg-neutral-100 p-1">
                {[
                  { key: "all", label: "全部" },
                  { key: "male", label: "男性" },
                  { key: "female", label: "女性" },
                  { key: "unisex", label: "中性" },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setActiveGender(item.key)}
                    className={`rounded-xl py-2 text-xs font-black ${activeGender === item.key ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tight">人氣穿搭排行</h3>
                </div>
                {isFavoriteLookbooksRankingLoading || favoriteLookbooksRankingError ? (
                  <div className="space-y-3">
                    {favoriteLookbooksRankingError ? (
                      <HomeLoadingHint message="資料載入中，請稍候" />
                    ) : null}
                    <HorizontalSkeletonCards count={3} className="h-[220px] w-[150px]" />
                  </div>
                ) : topFavoriteLookbooks.length === 0 ? (
                  <div className="rounded-3xl bg-neutral-50 p-6 text-center text-sm font-bold text-neutral-400">
                    目前還沒有穿搭收藏排行資料。
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
                    {topFavoriteLookbooks.map((lookbook) => (
                      <RankingLookbookCard
                        key={`lookbook-rank-${lookbook.id}`}
                        lookbook={lookbook}
                        rank={lookbook.rank}
                        metricLabel={`收藏 ${lookbook.favoriteCount || 0} 次`}
                        isFavorite={isFavoriteLookbook(favoriteLookbookIds, lookbook.id)}
                        onToggleFavorite={toggleFavoriteLookbook}
                        onClick={() => {
                          setSelectedLookbook(lookbook);
                          setTab("lookbook-detail");
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>

              {lookbooks.length === 0 ? (
                <div className="rounded-3xl bg-neutral-50 p-8 text-center">
                  <Sparkles className="mx-auto mb-3 text-neutral-400" size={36} />
                  <h3 className="font-black">目前沒有 Lookbook</h3>
                  <p className="mt-1 text-sm text-neutral-500">先到 Xano 新增 AI 穿搭圖片。</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {lookbooks
                    .filter((lookbook) => activeGender === "all" || lookbook.gender === activeGender || (activeGender !== "all" && lookbook.gender === "unisex"))
                    .map((lookbook, index) => {
                      const relatedProducts = products.filter((product) => lookbook.product_ids.includes(Number(product.id)));
                      const outfitTotal = relatedProducts.reduce((sum, product) => sum + Number(product.price || 0), 0);

                      return (
                        <Card key={lookbook.id} className="overflow-hidden rounded-[2rem] border-neutral-100 shadow-sm">
                          <div className="relative">
                            <button
                              onClick={() => {
                                setSelectedLookbook(lookbook);
                                setTab("lookbook-detail");
                              }}
                              className="block w-full text-left"
                            >
                              <img src={lookbook.image} alt={lookbook.title} className="h-[500px] w-full object-cover" />
                            </button>

                            <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-sm font-black text-neutral-800 backdrop-blur">
                              #{String(index + 1).padStart(2, "0")}
                            </div>

                            <div className="absolute right-4 top-4 z-10">
                              <FavoriteHeartButton
                                isFavorite={isFavoriteLookbook(favoriteLookbookIds, lookbook.id)}
                                onToggle={() => toggleFavoriteLookbook(lookbook.id)}
                              />
                            </div>

                            {relatedProducts.length > 0 && (
                              <button
                                onClick={() => openOutfitBuilder(lookbook)}
                                className="absolute bottom-4 right-4 rounded-full bg-neutral-900/90 px-4 py-2 text-sm font-black text-white shadow-lg backdrop-blur active:scale-[0.98]"
                              >
                                🛍 整套買
                              </button>
                            )}
                          </div>

                          <CardContent className="space-y-4 p-4">
                            <div>
                              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">{lookbook.tag}</span>
                              <h3 className="mt-3 text-2xl font-black leading-tight">{lookbook.title}</h3>
                            </div>

                            {relatedProducts.length > 0 ? (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-black">本套商品</p>
                                  <p className="text-sm font-bold text-neutral-500">{relatedProducts.length} 件商品</p>
                                </div>

                                <div className="grid grid-cols-4 gap-2">
                                  {relatedProducts.slice(0, 4).map((product) => (
                                    <button
                                      key={product.id}
                                      onClick={() => openProduct(product)}
                                      className="text-left"
                                    >
                                      <div className="overflow-hidden rounded-2xl bg-neutral-100">
                                        <img src={product.image} alt={product.name} className="h-20 w-full object-cover" />
                                      </div>
                                      <p className="mt-1 line-clamp-1 text-[11px] font-bold">{product.name}</p>
                                      <p className="text-[11px] font-black">{formatPrice(product.price)}</p>
                                    </button>
                                  ))}
                                </div>

                                <Button
                                  onClick={() => openOutfitBuilder(lookbook)}
                                  className="h-12 w-full rounded-2xl bg-neutral-900 text-base"
                                >
                                  🛍 整套買・{formatPrice(outfitTotal)}
                                </Button>
                              </div>
                            ) : (
                              <div className="rounded-2xl bg-neutral-50 p-4 text-sm font-bold text-neutral-500">
                                這套穿搭還沒有綁定商品。
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              )}
            </motion.div>
          )}

          {tab === "outfit-builder" && selectedLookbook && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <button onClick={() => setTab("lookbook")} className="text-sm font-bold text-neutral-500">← 返回 LOOKBOOK</button>

              <div className="overflow-hidden rounded-[2rem] bg-neutral-100">
                <img src={selectedLookbook.image} alt={selectedLookbook.title} className="h-[420px] w-full object-cover" />
              </div>

              <div className="space-y-2">
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">{selectedLookbook.tag}</span>
                <h2 className="text-2xl font-black leading-tight">選擇整套尺寸</h2>
                <p className="text-sm leading-6 text-neutral-500">每件商品都先選好顏色與尺寸，再加入整套到購物車。</p>
              </div>

              <div className="space-y-4 pb-[180px]">
                {getLookbookProducts(selectedLookbook).map((product) => {
                  const selection = outfitSelections[product.id] || getDefaultOutfitSelection(product);
                  const colorOptions = getProductColorOptions(product);
                  const sizeOptions = getProductSizeOptionsByColor(product, selection.color);
                  const sizeNames = sizeOptions.map((item) => item.name);
                  const disabledSizeNames = sizeOptions.filter((item) => isSizeOutOfStock(item)).map((item) => item.name);
                  const statusMap = Object.fromEntries(sizeOptions.map((item) => [item.name, item.stock_status || "unknown"]));
                  const stockMap = Object.fromEntries(sizeOptions.map((item) => [item.name, getSizeStockQty(item)]));

                  return (
                    <Card key={product.id} className="rounded-[2rem] border-neutral-100 shadow-sm">
                      <CardContent className="space-y-4 p-4">
                        <div className="flex gap-3">
                          <button onClick={() => openProduct(product)} className="h-24 w-20 shrink-0 overflow-hidden rounded-2xl bg-neutral-100">
                            <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-neutral-400">{product.brand}</p>
                            <h3 className="line-clamp-2 font-black leading-tight">{product.name}</h3>
                            <p className="mt-2 text-sm font-black">{formatPrice(product.price)}</p>
                          </div>
                        </div>

                        <OptionGroup
                          title="顏色"
                          options={colorOptions}
                          value={selection.color}
                          setValue={(color) => {
                            const nextSizeOptions = getProductSizeOptionsByColor(product, color);
                            const nextSize = findFirstSelectableSize(nextSizeOptions)?.name || nextSizeOptions[0]?.name || "";
                            updateOutfitSelection(product.id, { color, size: nextSize });
                          }}
                        />

                        <OptionGroup
                          title="尺寸"
                          options={sizeNames}
                          value={selection.size}
                          setValue={(size) => updateOutfitSelection(product.id, { size })}
                          disabledOptions={disabledSizeNames}
                          statusMap={statusMap}
                          stockMap={stockMap}
                        />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="fixed bottom-[72px] left-1/2 z-20 w-full max-w-md -translate-x-1/2 px-5">
                <div className="rounded-[2rem] border border-neutral-100 bg-white/95 p-4 shadow-2xl backdrop-blur">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black tracking-widest text-neutral-400">OUTFIT TOTAL</p>
                      <p className="text-xl font-black">{formatPrice(getLookbookProducts(selectedLookbook).reduce((sum, product) => sum + Number(product.price || 0), 0))}</p>
                    </div>
                    <p className="text-sm font-bold text-neutral-500">{getLookbookProducts(selectedLookbook).length} 件商品</p>
                  </div>
                  <Button onClick={addOutfitSelectionsToCart} className="h-12 w-full rounded-2xl bg-neutral-900 text-base">
                    🛍 加入整套購物車
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {tab === "lookbook-detail" && selectedLookbook && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <button onClick={() => setTab("lookbook")} className="text-sm font-bold text-neutral-500">← 返回 LOOKBOOK</button>
              <div className="overflow-hidden rounded-[2rem] bg-neutral-100">
                <img src={selectedLookbook.image} alt={selectedLookbook.title} className="h-[560px] w-full object-cover" />
              </div>
              <div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">{selectedLookbook.tag}</span>
                <h2 className="mt-3 text-2xl font-black">{selectedLookbook.title}</h2>
              </div>
              <section>
                <h3 className="mb-3 text-lg font-black">這套穿搭商品</h3>
                <div className="grid grid-cols-2 gap-3">
                  {products
                    .filter((product) => selectedLookbook.product_ids.includes(Number(product.id)))
                    .map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        isFavorite={isFavoriteProduct(favoriteIds, product.id)}
                        onToggleFavorite={toggleFavorite}
                        onClick={() => openProduct(product)}
                      />
                    ))}
                </div>
              </section>
            </motion.div>
          )}

          {tab === "shop" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div>
                <p className="text-sm font-bold tracking-widest text-neutral-400">SHOP</p>
                <h2 className="text-2xl font-black tracking-tight">
                  {activeBrand !== "all" ? `${activeBrand} 全部商品` : "全部商品"}
                </h2>
              </div>

              <label className="flex items-center gap-2 rounded-2xl bg-neutral-100 px-4 py-3">
                <Search size={18} className="shrink-0 text-neutral-400" />
                <input
                  type="search"
                  value={shopSearchQuery}
                  onChange={(event) => setShopSearchQuery(event.target.value)}
                  placeholder="搜尋商品名稱、品牌、JGO-57、ZOZO ID"
                  className="w-full bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-500"
                />
                {shopSearchQuery ? (
                  <button
                    type="button"
                    onClick={() => setShopSearchQuery("")}
                    className="shrink-0 rounded-full bg-neutral-200 px-2 py-1 text-[11px] font-black text-neutral-600"
                  >
                    清除
                  </button>
                ) : null}
              </label>

              <div className="space-y-2">
                <p className="text-sm font-black">性別分類</p>
                <div className="grid grid-cols-4 gap-2 rounded-2xl bg-neutral-100 p-1">
                  {[
                    { key: "all", label: "全部" },
                    { key: "male", label: "男裝" },
                    { key: "female", label: "女裝" },
                    { key: "unisex", label: "中性" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setActiveGender(item.key)}
                      className={`rounded-xl py-2 text-xs font-black transition ${activeGender === item.key ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-500"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-black">品牌分類</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {brandOptions.map((brand) => (
                    <button
                      key={brand}
                      onClick={() => {
                        if (brand !== "all") {
                          trackBrandClick(brand);
                        }
                        setActiveBrand(brand);
                      }}
                      className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-black ${activeBrand === brand ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}
                    >
                      {brand === "all" ? "全部品牌" : brand}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-neutral-500">
                  共 {filteredProducts.length} 件商品
                </p>
                {(activeGender !== "all" || activeBrand !== "all" || shopSearchQuery.trim()) && (
                  <button
                    onClick={() => {
                      setActiveGender("all");
                      setActiveBrand("all");
                      setShopSearchQuery("");
                    }}
                    className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-black text-neutral-600"
                  >
                    清除篩選
                  </button>
                )}
              </div>

              {loadingProducts && !hasProductsCache ? (
                <ProductGridSkeleton count={4} />
              ) : !loadingProducts && !hasProductsCache && products.length === 0 ? (
                <div className="rounded-[2rem] bg-neutral-50 p-8 text-center">
                  <h3 className="font-black">目前沒有商品</h3>
                  <p className="mt-1 text-sm text-neutral-500">請稍後再試或重新整理頁面。</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="rounded-[2rem] bg-neutral-50 p-8 text-center">
                  <h3 className="font-black">目前沒有符合的商品</h3>
                  <p className="mt-1 text-sm text-neutral-500">可以切換性別、品牌分類或調整搜尋關鍵字。</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      isFavorite={isFavoriteProduct(favoriteIds, product.id)}
                      onToggleFavorite={toggleFavorite}
                      onClick={() => openProduct(product)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {tab === "product" && selectedProduct && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="space-y-3">
                <div
                  className="relative overflow-hidden rounded-3xl bg-neutral-100"
                  onTouchStart={handleImageTouchStart}
                  onTouchEnd={handleImageTouchEnd}
                >
                  <img
                    src={productImages[selectedImageIndex] || selectedProduct.image}
                    alt={selectedProduct.name}
                    className="h-80 w-full object-contain"
                  />
                  {productImages.length > 1 && (
                    <>
                      <button onClick={goToPrevImage} className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-xl font-black shadow-sm">‹</button>
                      <button onClick={goToNextImage} className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-xl font-black shadow-sm">›</button>
                    </>
                  )}
                  {productImages.length > 1 && (
                    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-white/80 px-3 py-2 backdrop-blur">
                      {productImages.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setSelectedImageIndex(index)}
                          className={`h-2 w-2 rounded-full ${selectedImageIndex === index ? "bg-neutral-900" : "bg-neutral-300"}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {productImages.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {productImages.map((image, index) => (
                      <button key={image} onClick={() => setSelectedImageIndex(index)} className={`shrink-0 overflow-hidden rounded-2xl border-2 ${selectedImageIndex === index ? "border-neutral-900" : "border-transparent"}`}>
                        <img src={image} alt={`${selectedProduct.name}-${index}`} className="h-16 w-16 object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openBrandShop(selectedProduct.brand)}
                      className="text-sm font-bold text-neutral-700 underline decoration-neutral-300 underline-offset-4"
                    >
                      {selectedProduct.brand}
                    </button>
                    <h2 className="mt-1 text-2xl font-black">{selectedProduct.name}</h2>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="text-xl font-black">{formatPrice(selectedProduct.price)}</span>
                      <span className="text-sm text-neutral-400 line-through">{formatPrice(selectedProduct.compareAt)}</span>
                    </div>
                  </div>
                  <FavoriteHeartButton
                    isFavorite={isFavoriteProduct(favoriteIds, selectedProduct.id)}
                    onToggle={() => toggleFavorite(selectedProduct.id)}
                    className="h-11 w-11 shrink-0"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {PRODUCT_TRUST_BADGES.map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-black text-white"
                    >
                      {badge}
                    </span>
                  ))}
                </div>

                <Card className="rounded-3xl border-neutral-100 bg-neutral-50 shadow-sm">
                  <CardContent className="space-y-2 p-4">
                    <p className="text-xs font-black tracking-widest text-neutral-400">PRODUCT INFO</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-neutral-400">品牌</p>
                        <button
                          type="button"
                          onClick={() => openBrandShop(selectedProduct.brand)}
                          className="font-bold text-neutral-900 underline decoration-neutral-300 underline-offset-2"
                        >
                          {selectedProduct.brand}
                        </button>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-400">商品編號</p>
                        <p className="font-bold text-neutral-900">JGO-{selectedProduct.id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-400">商品性別</p>
                        <p className="font-bold text-neutral-900">{formatProductGender(selectedProduct.gender)}</p>
                      </div>
                      {(() => {
                        const modelDisplay = formatModelSizeDisplay({
                          model_height_cm: selectedProduct.modelHeightCm || null,
                          model_weight_kg: selectedProduct.modelWeightKg || null,
                          model_wear_size: selectedProduct.modelWearSize || "",
                        });

                        return modelDisplay ? (
                          <div className="col-span-2">
                            <p className="font-bold text-neutral-900">{modelDisplay}</p>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </CardContent>
                </Card>
              </div>
              <OptionGroup
                title="顏色"
                options={getProductColorOptions(selectedProduct)}
                value={selectedColor}
                setValue={(color) => {
                  const nextSizeOptions = getSizeOptionsForColor(selectedProduct, color);
                  const firstAvailableSize = findFirstSelectableSize(nextSizeOptions)?.name || nextSizeOptions[0]?.name || "";
                  setSelectedColor(color);
                  setSelectedSize(firstAvailableSize);
                }}
                disabledOptions={Object.entries(colorStockMaps.statusMap)
                  .filter(([, status]) => status === "out_of_stock")
                  .map(([color]) => color)}
                statusMap={colorStockMaps.statusMap}
                stockMap={colorStockMaps.stockMap}
              />
              <OptionGroup
                title="尺寸"
                options={availableSizes}
                value={selectedSize}
                setValue={setSelectedSize}
                disabledOptions={availableSizeOptions.filter((size) => isSizeOutOfStock(size)).map((size) => size.name)}
                statusMap={Object.fromEntries(availableSizeOptions.map((size) => [size.name, size.stock_status || "unknown"]))}
                stockMap={Object.fromEntries(availableSizeOptions.map((size) => [size.name, getSizeStockQty(size)]))}
              />
              {(productFeatureText || productSizeInfoText || brandIntroText || selectedProduct.sizeChart || selectedProduct.sizeTableJson?.length > 0) && (
                <Card className="rounded-3xl border-neutral-100 bg-neutral-50 shadow-sm">
                  <CardContent className="space-y-3 p-5">
                    <div>
                      <p className="text-xs font-black tracking-widest text-neutral-400">PRODUCT DETAILS</p>
                      <h3 className="mt-1 text-lg font-black">商品介紹</h3>
                    </div>
                    <ProductAccordion
                      sections={[
                        {
                          key: "features",
                          title: "商品特色",
                          content: productFeatureText ? (
                            <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-600">{productFeatureText}</p>
                          ) : null,
                        },
                        {
                          key: "size-info",
                          title: "尺寸資訊",
                          content:
                            selectedProduct.sizeTableJson?.length > 0 ||
                            productSizeInfoText ||
                            selectedProduct.sizeChart ? (
                              <div className="space-y-4">
                                {selectedProduct.sizeTableJson?.length > 0 ? (
                                  <SizeTableJsonTable rows={selectedProduct.sizeTableJson} />
                                ) : null}
                                {productSizeInfoText ? (
                                  <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                                    {productSizeInfoText}
                                  </p>
                                ) : null}
                                {!selectedProduct.sizeTableJson?.length && selectedProduct.sizeChart ? (
                                  <SizeChartTable sizeChart={selectedProduct.sizeChart} />
                                ) : null}
                              </div>
                            ) : null,
                        },
                        {
                          key: "brand",
                          title: "品牌介紹",
                          content: brandIntroText ? (
                            <div className="space-y-3">
                              <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-600">{brandIntroText}</p>
                              <button
                                type="button"
                                onClick={() => openBrandShop(selectedProduct.brand)}
                                className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white"
                              >
                                查看 {selectedProduct.brand} 更多商品
                              </button>
                            </div>
                          ) : null,
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              )}
              <Card className="rounded-3xl border-neutral-100 bg-neutral-50 shadow-sm">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-neutral-500" />
                    <h3 className="font-black">AI 智能尺寸推薦</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="col-span-2 block">
                      <span className="mb-1 block text-sm font-bold">性別</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setSizeAI({ ...sizeAI, gender: "male" })}
                          className={`h-11 rounded-2xl font-black ${sizeAI.gender === "male" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}
                        >
                          男性
                        </button>
                        <button
                          onClick={() => setSizeAI({ ...sizeAI, gender: "female" })}
                          className={`h-11 rounded-2xl font-black ${sizeAI.gender === "female" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}
                        >
                          女性
                        </button>
                      </div>
                    </label>
                    <Input
                      label="身高"
                      placeholder="175"
                      value={sizeAI.height}
                      onChange={(value) => setSizeAI({ ...sizeAI, height: value })}
                    />
                    <Input
                      label="體重（選填）"
                      placeholder="68"
                      value={sizeAI.weight}
                      onChange={(value) => setSizeAI({ ...sizeAI, weight: value })}
                    />
                  </div>

                  <Button
                    onClick={handleRecommendSize}
                    className="h-11 w-full rounded-2xl bg-neutral-900 text-sm font-black text-white"
                  >
                    推薦尺寸
                  </Button>

                  {sizeAIResult && (
                    <div className="space-y-3 rounded-3xl bg-neutral-900 p-5 text-white">
                      <div>
                        <p className="text-xs font-bold tracking-widest text-neutral-400">AI FIT REPORT</p>
                        {sizeAIResult.canRecommend && sizeAIResult.recommendedSize ? (
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-2xl bg-white/10 p-3">
                              <p className="text-[11px] text-neutral-300">推薦尺寸</p>
                              <p className="mt-1 text-2xl font-black">{sizeAIResult.recommendedSize}</p>
                            </div>
                            <div className="rounded-2xl bg-white/5 p-3">
                              <p className="text-[11px] text-neutral-300">合身建議</p>
                              <p className="mt-1 text-xl font-black">{sizeAIResult.fitSize}</p>
                            </div>
                            <div className="rounded-2xl bg-white/5 p-3">
                              <p className="text-[11px] text-neutral-300">寬鬆建議</p>
                              <p className="mt-1 text-xl font-black">{sizeAIResult.looseSize}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-neutral-300">
                            {sizeAIResult.errorMessage || "暫無法計算推薦尺寸"}
                          </p>
                        )}
                      </div>

                      <div className="rounded-2xl bg-white/10 p-4 text-sm leading-6 text-neutral-200">
                        <p className="font-bold text-white">推薦理由</p>
                        <p className="mt-1">{sizeAIResult.reason}</p>
                        {sizeAIResult.dataSource ? (
                          <p className="mt-3 border-t border-white/10 pt-3 text-xs text-neutral-300">
                            資料來源：{sizeAIResult.dataSource}
                          </p>
                        ) : null}
                      </div>

                      {sizeAIResult.canRecommend && sizeAIResult.recommendedSize ? (
                        <button
                          type="button"
                          onClick={() => setSelectedSize(sizeAIResult.recommendedSize)}
                          className="h-11 w-full rounded-2xl bg-white text-sm font-black text-neutral-900"
                        >
                          使用推薦尺寸 {sizeAIResult.recommendedSize}
                        </button>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button onClick={addToCart} className="h-12 w-full rounded-2xl bg-neutral-900 text-base">加入購物車</Button>
              {!currentUser && <p className="text-center text-sm text-neutral-400">登入後才能加入購物車與結帳</p>}
            </motion.div>
          )}

          {tab === "favorites" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div>
                <p className="text-sm font-bold tracking-widest text-neutral-400">FAVORITES</p>
                <h2 className="text-2xl font-black tracking-tight">我的收藏</h2>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-1">
                {[
                  { key: "products", label: "商品收藏" },
                  { key: "lookbooks", label: "穿搭收藏" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFavoritesTab(item.key)}
                    className={`rounded-xl py-2.5 text-sm font-black ${favoritesTab === item.key ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {favoritesTab === "products" ? (
                <>
                  <p className="text-sm text-neutral-500">共 {favoriteProducts.length} 件商品</p>

                  {favoriteProducts.length === 0 ? (
                    <div className="rounded-[2rem] bg-neutral-50 p-8 text-center">
                      <Heart size={28} className="mx-auto text-neutral-300" />
                      <h3 className="mt-4 font-black">還沒有收藏商品</h3>
                      <p className="mt-1 text-sm text-neutral-500">在商品卡片或詳情頁按愛心即可加入收藏。</p>
                      <button
                        type="button"
                        onClick={() => setTab("shop")}
                        className="mt-5 rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-black text-white"
                      >
                        前往選購
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {favoriteProducts.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          isFavorite={isFavoriteProduct(favoriteIds, product.id)}
                          onToggleFavorite={toggleFavorite}
                          onClick={() => openProduct(product)}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-neutral-500">共 {favoriteLookbooks.length} 套穿搭</p>

                  {favoriteLookbooks.length === 0 ? (
                    <div className="rounded-[2rem] bg-neutral-50 p-8 text-center">
                      <Heart size={28} className="mx-auto text-neutral-300" />
                      <h3 className="mt-4 font-black">還沒有收藏穿搭</h3>
                      <p className="mt-1 text-sm text-neutral-500">在 Lookbook 卡片右上角按愛心即可加入收藏。</p>
                      <button
                        type="button"
                        onClick={() => setTab("lookbook")}
                        className="mt-5 rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-black text-white"
                      >
                        前往穿搭
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {favoriteLookbooks.map((lookbook) => {
                        const relatedProducts = products.filter((product) => lookbook.product_ids.includes(Number(product.id)));

                        return (
                          <Card key={lookbook.id} className="overflow-hidden rounded-[2rem] border-neutral-100 shadow-sm">
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLookbook(lookbook);
                                  setTab("lookbook-detail");
                                }}
                                className="block w-full text-left"
                              >
                                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-[28px] bg-neutral-100">
                                  <img src={lookbook.image} alt={lookbook.title} className="h-full w-full object-contain" />
                                </div>
                              </button>
                              <div className="absolute right-3 top-3 z-10">
                                <FavoriteHeartButton
                                  isFavorite={isFavoriteLookbook(favoriteLookbookIds, lookbook.id)}
                                  onToggle={() => toggleFavoriteLookbook(lookbook.id)}
                                />
                              </div>
                            </div>
                            <CardContent className="space-y-3 p-4">
                              <div>
                                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">{lookbook.tag}</span>
                                <h3 className="mt-3 text-lg font-black leading-tight">{lookbook.title}</h3>
                              </div>
                              <Button
                                onClick={() => openOutfitBuilder(lookbook)}
                                disabled={relatedProducts.length === 0}
                                className="h-11 w-full rounded-2xl bg-neutral-900 text-sm disabled:bg-neutral-300"
                              >
                                🛍 整套買
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {tab === "cart" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h2 className="text-2xl font-black">購物車</h2>
              {cart.length === 0 ? (
                <EmptyState title="購物車是空的" text="先去挑一套日系穿搭吧。" action={() => setTab("shop")} />
              ) : (
                <>
                  {cart.map((item) => (
                    <Card key={item.key} className="rounded-3xl border-neutral-100 shadow-sm">
                      <CardContent className="flex gap-3 p-3">
                        <img src={item.image} alt={item.name} className="h-24 w-20 rounded-2xl object-cover" />
                        <div className="flex-1">
                          <h3 className="font-bold leading-tight">{item.name}</h3>
                          <p className="mt-1 text-xs text-neutral-500">{item.color} / {item.size}</p>
                          <p className="mt-2 font-bold">{formatPrice(item.price)}</p>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button onClick={() => updateQty(item.key, -1)} className="rounded-full border p-1"><Minus size={14} /></button>
                              <span className="w-5 text-center text-sm">{item.qty}</span>
                              <button onClick={() => updateQty(item.key, 1)} className="rounded-full border p-1"><Plus size={14} /></button>
                            </div>
                            <button onClick={() => removeItem(item.key)} className="text-neutral-400"><Trash2 size={18} /></button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <PriceBox subtotal={subtotal} shipping={shipping} total={total} />
                  <Button onClick={() => {
                    if (!isSignedIn || !currentUser) return requireLogin();
                    setTab("checkout");
                  }} className="h-12 w-full rounded-2xl bg-neutral-900 text-base">前往結帳</Button>
                </>
              )}
            </motion.div>
          )}

          {tab === "checkout" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <h2 className="text-2xl font-black">結帳</h2>
              <section className="space-y-3">
                <Input label="姓名" placeholder="王小明" value={checkoutForm.name} onChange={(value) => setCheckoutForm({ ...checkoutForm, name: value })} />
                <Input label="手機" placeholder="0912345678" value={checkoutForm.phone} onChange={(value) => setCheckoutForm({ ...checkoutForm, phone: value })} />
                <Input label="Email" placeholder="hello@example.com" value={checkoutForm.email} onChange={(value) => setCheckoutForm({ ...checkoutForm, email: value })} icon={<Mail size={18} />} />
              </section>
              <section>
                <h3 className="mb-3 font-bold">配送方式</h3>
                <div className="grid grid-cols-2 gap-3">
                  <DeliveryButton active={delivery === "711"} onClick={() => setDelivery("711")} icon={<Store size={18} />} title="7-11 取貨" />
                  <DeliveryButton active={delivery === "home"} onClick={() => setDelivery("home")} icon={<Truck size={18} />} title="宅配" />
                </div>
              </section>
              {delivery === "711" ? (
                <Card className="rounded-3xl border-neutral-100">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center gap-2 font-bold"><MapPin size={18} /> 已選門市</div>
                    <p className="text-sm text-neutral-600">
                      {pickupStore.store_name || "尚未選擇門市"}
                      {pickupStore.store_id && `｜${pickupStore.store_id}`}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {pickupStore.address || "請選擇 7-11 門市"}
                    </p>
                    <Button
                      onClick={async () => {
                        try {
                          const response = await fetch(XANO_CREATE_CVS_MAP_URL, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              logistics_sub_type: "UNIMART",
                            }),
                          });

                          if (!response.ok) {
                            throw new Error(`開啟門市地圖失敗：${response.status}`);
                          }

                          const data = await response.json();

                          localStorage.setItem("jgo_cart", JSON.stringify(cart));
                          localStorage.setItem("jgo_delivery", delivery);
                          localStorage.setItem("jgo_pickup_store", JSON.stringify(pickupStore));

                          if (data.cvs_map_url) {
                            const form = document.createElement("form");
                            form.method = "POST";
                            form.action = data.cvs_map_url;

                            Object.entries(data).forEach(([key, value]) => {
                              if (key === "cvs_map_url") return;

                              const input = document.createElement("input");
                              input.type = "hidden";
                              input.name = key;
                              input.value = String(value);
                              form.appendChild(input);
                            });

                            document.body.appendChild(form);
                            form.submit();
                          } else {
                            throw new Error("Xano 沒有回傳 cvs_map_url");
                          }
                        } catch (error) {
                          console.error(error);
                          alert(error.message || "開啟門市地圖失敗");
                        }
                      }}
                      className="mt-2 rounded-2xl bg-neutral-900"
                    >
                      選擇門市
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <section className="space-y-3">
                  <Input
                    label="縣市"
                    placeholder="新竹市"
                    value={shippingAddress.city}
                    onChange={(value) => setShippingAddress({ ...shippingAddress, city: value })}
                  />
                  <Input
                    label="區域"
                    placeholder="東區"
                    value={shippingAddress.district}
                    onChange={(value) => setShippingAddress({ ...shippingAddress, district: value })}
                  />
                  <Input
                    label="詳細地址"
                    placeholder="食品路 100 號"
                    value={shippingAddress.address}
                    onChange={(value) => setShippingAddress({ ...shippingAddress, address: value })}
                  />
                </section>
              )}
              <PriceBox subtotal={subtotal} shipping={shipping} total={total} />
              <Button onClick={submitOrder} className="h-12 w-full rounded-2xl bg-neutral-900 text-base">
                {isSubmitting ? "送出中..." : "送出訂單"}
              </Button>
            </motion.div>
          )}

          {tab === "account" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <h2 className="text-2xl font-black">我的帳號</h2>
              {currentUser ? (
                <Card className="rounded-3xl border-neutral-100 shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-xl font-black text-white">
                        {(currentUser.name || "J").slice(0, 1)}
                      </div>
                      <div>
                        <h3 className="text-lg font-black">{currentUser.name}</h3>
                        <p className="text-sm text-neutral-500">{currentUser.email}</p>
                        <p className="text-sm text-neutral-500">{currentUser.phone}</p>
                        <p className="text-xs text-neutral-400">登入方式：{currentUser.provider}</p>
                      </div>
                    </div>
                    <div className="space-y-3 rounded-3xl bg-neutral-50 p-4">
                      <h4 className="font-black">編輯會員資料</h4>
                      <Input label="姓名" placeholder="你的名字" value={accountForm.name} onChange={(value) => setAccountForm({ ...accountForm, name: value })} />
                      <Input label="Gmail / Email" placeholder="hello@gmail.com" value={accountForm.email} onChange={(value) => setAccountForm({ ...accountForm, email: value })} icon={<Mail size={18} />} />
                      <Input label="手機號碼" placeholder="0912345678" value={accountForm.phone} onChange={(value) => setAccountForm({ ...accountForm, phone: value })} />
                      <Button onClick={saveAccount} className="h-12 w-full rounded-2xl bg-neutral-900 text-base">儲存資料</Button>
                    </div>

                    {isAdmin && (
                      <Button
                        onClick={() => setTab("admin")}
                        className="h-12 w-full rounded-2xl bg-red-500 text-base"
                      >
                        管理商品
                      </Button>
                    )}

                    <div className="flex items-center justify-between rounded-2xl bg-neutral-50 px-4 py-3">
                      <span className="text-sm font-black text-neutral-600">帳號設定 / 登出</span>
                      <UserButton afterSignOutUrl="/" />
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="rounded-3xl border-neutral-100 shadow-sm">
                  <CardContent className="space-y-4 p-5 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                      <User size={28} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black">登入 J-GO 會員</h3>
                      <p className="mt-1 text-sm leading-6 text-neutral-500">登入後可以加入購物車、查看訂單與物流資訊。</p>
                    </div>

                    <SignInButton mode="redirect">
                      <button className="h-12 w-full rounded-2xl bg-neutral-900 text-base font-black text-white">
                        登入會員
                      </button>
                    </SignInButton>

                    <SignUpButton mode="redirect">
                      <button className="h-12 w-full rounded-2xl border border-neutral-200 bg-white text-base font-black text-neutral-900">
                        建立新帳號
                      </button>
                    </SignUpButton>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {tab === "admin" && isAdmin && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <button onClick={() => setTab("account")} className="text-sm font-bold text-neutral-500">← 返回我的帳號</button>
              <h2 className="text-2xl font-black">商品管理</h2>

              <Card className="rounded-3xl border-neutral-100 shadow-sm">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black tracking-widest text-neutral-400">PRELAUNCH</p>
                      <h3 className="text-lg font-black">上線前檢查</h3>
                    </div>
                    <Button
                      onClick={runPrelaunchChecklist}
                      className="rounded-2xl bg-neutral-900 text-xs"
                    >
                      {prelaunchLoading ? "檢查中..." : "執行檢查"}
                    </Button>
                  </div>

                  {prelaunchChecks.length > 0 ? (
                    <>
                      <p className={`text-sm font-bold ${summarizePrelaunchChecks(prelaunchChecks).ready ? "text-green-700" : "text-amber-700"}`}>
                        {summarizePrelaunchChecks(prelaunchChecks).passed}/{summarizePrelaunchChecks(prelaunchChecks).total} 項通過
                        {summarizePrelaunchChecks(prelaunchChecks).ready ? "，可上線" : "，仍有項目需確認"}
                      </p>
                      <div className="space-y-2">
                        {prelaunchChecks.map((check) => (
                          <div key={check.id} className="flex items-start justify-between gap-3 rounded-2xl bg-neutral-50 p-3">
                            <div>
                              <p className="font-bold text-neutral-900">{check.label}</p>
                              <p className="mt-1 text-xs text-neutral-500">{check.detail}</p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${check.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {check.passed ? "PASS" : "FAIL"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-neutral-500">按「執行檢查」確認商品 API、Lookbook、localStorage 與信任感區塊設定。</p>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-neutral-100 shadow-sm">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black tracking-widest text-neutral-400">ADMIN RANKING</p>
                      <h3 className="text-lg font-black">排行榜</h3>
                    </div>
                    <Button
                      onClick={() => {
                        loadHomeRankings({ hasCache: true });
                        loadLookbooks({ hasCache: true });
                        refreshProductsFromXano({ hasCache: true });
                      }}
                      className="rounded-2xl bg-neutral-900 text-xs"
                    >
                      刷新排行
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="mb-2 font-black">商品銷售排行</h4>
                      {topSalesProducts.length === 0 ? (
                        <p className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-500">目前沒有銷售排行資料</p>
                      ) : (
                        <div className="space-y-2">
                          {topSalesProducts.map((product) => (
                            <div key={`admin-sales-${product.id}`} className="flex items-center justify-between rounded-2xl bg-neutral-50 p-3">
                              <div>
                                <p className="font-black">#{product.rank} {product.name}</p>
                                <p className="text-xs text-neutral-500">JGO-{product.id}</p>
                              </div>
                              <p className="text-sm font-black text-neutral-700">已售出 {product.soldCount} 件</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 font-black">商品收藏排行</h4>
                      {topFavoriteProducts.length === 0 ? (
                        <p className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-500">目前沒有收藏排行資料</p>
                      ) : (
                        <div className="space-y-2">
                          {topFavoriteProducts.map((product) => (
                            <div key={`admin-product-fav-${product.id}`} className="flex items-center justify-between rounded-2xl bg-neutral-50 p-3">
                              <div>
                                <p className="font-black">#{product.rank} {product.name}</p>
                                <p className="text-xs text-neutral-500">{product.brand}</p>
                              </div>
                              <p className="text-sm font-black text-neutral-700">收藏 {product.favoriteCount || 0} 次</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 font-black">穿搭收藏排行</h4>
                      {topFavoriteLookbooks.length === 0 ? (
                        <p className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-500">目前沒有穿搭收藏排行資料</p>
                      ) : (
                        <div className="space-y-2">
                          {topFavoriteLookbooks.map((lookbook) => (
                            <div key={`admin-lookbook-fav-${lookbook.id}`} className="flex items-center justify-between rounded-2xl bg-neutral-50 p-3">
                              <div>
                                <p className="font-black">#{lookbook.rank} {lookbook.title}</p>
                                <p className="text-xs text-neutral-500">{lookbook.tag}</p>
                              </div>
                              <p className="text-sm font-black text-neutral-700">收藏 {lookbook.favoriteCount || 0} 次</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-neutral-100 shadow-sm">
                <CardContent className="space-y-3 p-4">
                  <h3 className="font-black">{editingLookbookId ? "編輯 AI LOOKBOOK" : "新增 AI LOOKBOOK"}</h3>
                  <Input
                    label="標題"
                    placeholder="東京日系黑白穿搭"
                    value={lookbookForm.title}
                    onChange={(value) => setLookbookForm({ ...lookbookForm, title: value })}
                  />
                  <Input
                    label="圖片網址"
                    placeholder="https://...jpg"
                    value={lookbookForm.image}
                    onChange={(value) => setLookbookForm({ ...lookbookForm, image: value })}
                  />
                  <Input
                    label="風格標籤"
                    placeholder="CITY BOY"
                    value={lookbookForm.tag}
                    onChange={(value) => setLookbookForm({ ...lookbookForm, tag: value })}
                  />
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">性別分流</span>
                    <select
                      className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 font-bold outline-none"
                      value={lookbookForm.gender}
                      onChange={(e) => setLookbookForm({ ...lookbookForm, gender: e.target.value })}
                    >
                      <option value="male">男性</option>
                      <option value="female">女性</option>
                      <option value="unisex">中性</option>
                    </select>
                  </label>
                  <Input
                    label="關聯商品 ID"
                    placeholder="1,2,3"
                    value={lookbookForm.product_ids}
                    onChange={(value) => setLookbookForm({ ...lookbookForm, product_ids: value })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={createLookbook} className="h-12 w-full rounded-2xl bg-neutral-900 text-base">
                      {editingLookbookId ? "更新 Lookbook" : "新增 Lookbook"}
                    </Button>
                    {editingLookbookId && (
                      <Button onClick={cancelEditLookbook} className="h-12 w-full rounded-2xl bg-neutral-200 text-neutral-900 text-base">
                        取消編輯
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-neutral-100 shadow-sm">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black">Lookbook 管理</h3>
                    <Button onClick={loadLookbooks} className="rounded-2xl bg-neutral-900 text-xs">刷新</Button>
                  </div>
                  {lookbooks.length === 0 ? (
                    <p className="text-sm text-neutral-500">目前沒有 Lookbook</p>
                  ) : lookbooks.map((lookbook) => (
                    <div key={lookbook.id} className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3">
                      <img src={lookbook.image} alt={lookbook.title} className="h-16 w-16 rounded-xl object-cover" />
                      <div className="flex-1">
                        <p className="font-bold">{lookbook.title}</p>
                        <p className="text-xs text-neutral-500">{lookbook.tag}｜{lookbook.gender === "male" ? "男性" : lookbook.gender === "female" ? "女性" : "中性"}｜商品 {lookbook.raw_product_ids}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => startEditLookbook(lookbook)} className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-black text-white">
                          編輯
                        </button>
                        <button onClick={() => deleteLookbook(lookbook.id)} className="rounded-xl bg-red-100 px-3 py-2 text-xs font-black text-red-600">
                          刪除
                        </button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-neutral-100 shadow-sm">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black tracking-widest text-neutral-400">ADMIN DASHBOARD</p>
                      <h3 className="text-xl font-black">訂單管理</h3>
                    </div>
                    <Button
                      onClick={() => loadAllOrdersForAdmin()}
                      className="rounded-2xl bg-neutral-900 text-xs"
                    >
                      刷新訂單
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {orders.length === 0 ? (
                      <div className="rounded-2xl bg-neutral-50 p-5 text-center text-sm text-neutral-500">
                        目前沒有訂單
                      </div>
                    ) : (
                      orders.map((order) => (
                        <div
                          key={order.id}
                          className="rounded-3xl border border-neutral-100 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-black">#{order.id}</p>
                              <p className="text-xs text-neutral-500">{order.createdAt}</p>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <span className={`rounded-full px-3 py-1 text-xs font-bold ${order.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {order.status}
                              </span>

                              <span className={`rounded-full px-3 py-1 text-xs font-bold ${order.shippingStatus === "已出貨" ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-700"}`}>
                                {order.shippingStatus}
                              </span>
                            </div>
                          </div>

                          <div className="mt-4 rounded-2xl bg-neutral-50 p-3">
                            <p className="mb-2 text-sm font-black">商品資訊</p>

                            <div className="space-y-2">
                              {order.items.map((item) => (
                                <div
                                  key={item.id || `${item.product_name}-${item.color}-${item.size}`}
                                  className="flex items-start justify-between gap-3 text-sm"
                                >
                                  <div>
                                    <p className="font-bold text-neutral-900">
                                      {item.product_name || item.name}
                                    </p>
                                    <p className="text-xs text-neutral-500">
                                      {item.color} / {item.size} × {item.qty}
                                    </p>
                                  </div>

                                  <p className="font-black">
                                    {formatPrice(item.subtotal || (item.unit_price || 0) * item.qty)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="mt-4 rounded-2xl bg-neutral-50 p-3">
                            <p className="mb-3 text-sm font-black">物流資訊</p>
                            <div className="space-y-2">
                              <input
                                value={trackingForms[order.id]?.shippingCompany ?? order.shippingCompany ?? ""}
                                onChange={(e) => updateTrackingForm(order.id, "shippingCompany", e.target.value)}
                                placeholder="物流公司，例如 7-ELEVEN"
                                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-bold outline-none"
                              />
                              <input
                                value={trackingForms[order.id]?.trackingNo ?? order.trackingNo ?? ""}
                                onChange={(e) => updateTrackingForm(order.id, "trackingNo", e.target.value)}
                                placeholder="物流單號"
                                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-bold outline-none"
                              />
                              <label className="block">
                                <span className="mb-1 block text-xs font-bold text-neutral-500">出貨時間</span>
                                <input
                                  type="datetime-local"
                                  value={
                                    trackingForms[order.id]?.shippedAt
                                    ?? toDatetimeLocalValue(order.shippedAt)
                                    ?? toDatetimeLocalValue(Date.now())
                                  }
                                  onChange={(e) => updateTrackingForm(order.id, "shippedAt", e.target.value)}
                                  className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-bold outline-none"
                                />
                              </label>
                            </div>
                            {(order.shippingCompany || order.trackingNo || order.shippedAt) && (
                              <p className="mt-2 text-xs font-bold text-neutral-500">
                                目前：{order.shippingCompany || "未填物流公司"} / {order.trackingNo || "未填單號"}
                                {order.shippedAt ? ` / ${formatShippedAt(order.shippedAt)}` : ""}
                              </p>
                            )}
                            <Button
                              onClick={() => saveOrderShipping(order)}
                              className="mt-3 h-11 w-full rounded-2xl bg-neutral-900 text-sm"
                            >
                              儲存出貨資訊
                            </Button>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <Button
                              onClick={() => updateOrderShippingStatus(order.id, "待出貨")}
                              className={`h-11 rounded-2xl text-sm ${order.shippingStatus === "待出貨"
                                ? "bg-neutral-900 text-white"
                                : "bg-neutral-100 text-neutral-900"
                                }`}
                            >
                              待出貨
                            </Button>

                            <Button
                              onClick={() => updateOrderShippingStatus(order.id, "已出貨")}
                              className={`h-11 rounded-2xl text-sm ${order.shippingStatus === "已出貨"
                                ? "bg-blue-600 text-white"
                                : "bg-neutral-100 text-neutral-900"
                                }`}
                            >
                              已出貨
                            </Button>
                          </div>

                          <div className="mt-4 border-t pt-4 text-right">
                            <p className="text-sm text-neutral-500">訂單總額</p>
                            <p className="text-2xl font-black">{formatPrice(order.total)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-neutral-100 shadow-sm">
                <CardContent className="space-y-3 p-4">
                  <h3 className="font-black">{editingProductId ? "編輯商品" : "新增商品"}</h3>
                  <Input label="商品名稱" placeholder="日系寬版襯衫" value={productForm.name} onChange={(value) => setProductForm({ ...productForm, name: value })} />
                  <Input label="品牌" placeholder="J-GO SELECT" value={productForm.brand} onChange={(value) => setProductForm({ ...productForm, brand: value })} />
                  <Input label="日幣價格（¥）" placeholder="8900" value={productForm.jpy_price} onChange={(value) => setProductForm({ ...productForm, jpy_price: value })} />
                  <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-xs font-bold leading-5 text-neutral-500">
                    台幣售價會由 Xano 的 jpy_rate × profit_rate 自動重算，前端後台不用手動輸入台幣價格。
                  </p>
                  <Input label="主圖網址" placeholder="https://...jpg" value={productForm.image} onChange={(value) => setProductForm({ ...productForm, image: value })} />
                  <Input label="輪播圖片網址" placeholder="https://a.jpg,https://b.jpg" value={productForm.images} onChange={(value) => setProductForm({ ...productForm, images: value })} />
                  <Input label="顏色" placeholder="黑色,白色,灰色" value={productForm.colors} onChange={(value) => setProductForm({ ...productForm, colors: value })} />
                  <Input label="尺寸" placeholder="S,M,L,XL" value={productForm.sizes} onChange={(value) => setProductForm({ ...productForm, sizes: value })} />
                  <Input label="庫存 variants" placeholder="黑色:M:5,L:3;白色:M:2,L:1" value={productForm.variants} onChange={(value) => setProductForm({ ...productForm, variants: value })} />
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-sm font-bold">性別分類</span>
                      <select
                        className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 font-bold outline-none"
                        value={productForm.gender}
                        onChange={(e) => setProductForm({ ...productForm, gender: e.target.value })}
                      >
                        <option value="male">男生 male</option>
                        <option value="female">女生 female</option>
                        <option value="unisex">中性 unisex</option>
                      </select>
                    </label>
                    <Input label="Tag" placeholder="日本選品" value={productForm.tag} onChange={(value) => setProductForm({ ...productForm, tag: value })} />
                  </div>

                  <div className="rounded-3xl bg-neutral-50 p-4 space-y-3">
                    <div>
                      <p className="text-xs font-black tracking-widest text-neutral-400">PRODUCT DETAILS</p>
                      <h4 className="font-black">商品詳細資訊</h4>
                    </div>
                    <TextArea label="商品介紹" placeholder="日系寬版短袖襯衫，適合單穿或外搭..." value={productForm.description} onChange={(value) => setProductForm({ ...productForm, description: value })} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="材質" placeholder="棉 / 聚酯纖維" value={productForm.material} onChange={(value) => setProductForm({ ...productForm, material: value })} />
                      <Input label="版型" placeholder="寬鬆 / 落肩" value={productForm.fit} onChange={(value) => setProductForm({ ...productForm, fit: value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input label="Model身高" placeholder="178" value={productForm.model_height} onChange={(value) => setProductForm({ ...productForm, model_height: value })} />
                      <Input label="Model體重" placeholder="65" value={productForm.model_weight} onChange={(value) => setProductForm({ ...productForm, model_weight: value })} />
                      <Input label="著用尺寸" placeholder="L" value={productForm.model_size} onChange={(value) => setProductForm({ ...productForm, model_size: value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="推薦身高範圍" placeholder="170-180" value={productForm.recommended_height} onChange={(value) => setProductForm({ ...productForm, recommended_height: value })} />
                      <Input label="推薦體重範圍" placeholder="60-75" value={productForm.recommended_weight} onChange={(value) => setProductForm({ ...productForm, recommended_weight: value })} />
                    </div>
                    <TextArea label="尺寸表" placeholder={"尺寸,長度,肩寬,胸圍,袖長\nS,74,53.5,124,29\nM,76,55,128,30\nL,78,56.5,132,31"} value={productForm.size_chart} onChange={(value) => setProductForm({ ...productForm, size_chart: value })} />
                  </div>
                  {editingProductId ? (
                    <div className="rounded-3xl border border-neutral-200 p-4">
                      <SizeTableEditor
                        key={editingProductId}
                        productId={editingProductId}
                        initialRows={
                          products.find((item) => item.id === editingProductId)?.sizeTableJson || []
                        }
                        onSaved={(rows) => {
                          setProducts((prev) =>
                            prev.map((item) =>
                              item.id === editingProductId ? { ...item, sizeTableJson: rows } : item
                            )
                          );
                        }}
                      />
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={createProduct} className="h-12 w-full rounded-2xl bg-neutral-900 text-base">
                      {editingProductId ? "更新商品" : "新增商品"}
                    </Button>
                    {editingProductId ? (
                      <Button onClick={resetProductForm} className="h-12 w-full rounded-2xl bg-neutral-200 text-neutral-900 text-base">
                        取消編輯
                      </Button>
                    ) : (
                      <div />
                    )}
                  </div>
                  {editingProductId && (
                    <Button
                      onClick={() => {
                        const product = products.find((item) => item.id === editingProductId);
                        if (product) {
                          handleSyncStock(product);
                        }
                      }}
                      className="h-12 w-full rounded-2xl bg-blue-600 text-base text-white"
                    >
                      同步庫存
                    </Button>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={recalculateAllProducts}
                  className="h-12 rounded-2xl bg-red-600 text-base text-white"
                >
                  重算全部價格
                </Button>

                <Button
                  onClick={() => refreshProductsFromXano({ hasCache: true })}
                  className="h-12 rounded-2xl bg-neutral-900 text-base text-white"
                >
                  同步商品
                </Button>
              </div>

              <div className="space-y-3">
                {products.map((product) => (
                  <Card key={product.id} className="rounded-3xl border-neutral-100 shadow-sm">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center gap-3">
                        <img src={product.image} alt={product.name} className="h-16 w-16 rounded-2xl object-cover" />
                        <div className="flex-1">
                          <p className="font-black">{product.name}</p>
                          <p className="text-sm text-neutral-500">{product.brand}</p>
                          <p className="text-sm font-bold">{formatPrice(product.price)}</p>
                          <div className="mt-2 space-y-0.5 text-xs text-neutral-500">
                            <p>J-GO ID：{product.id}</p>
                            <p>來源：{product.source_site || "unknown"}</p>
                            <p>來源商品ID：{product.source_product_id || "-"}</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-neutral-50 p-3 text-xs text-neutral-600">
                        <p className="mb-2 font-black text-neutral-900">庫存 variants</p>
                        {product.variants?.length > 0 ? product.variants.map((variant) => (
                          <div key={variant.color} className="mb-1">
                            <span className="font-bold">{variant.color}：</span>
                            {variant.sizes?.map((size) => `${size.name}(${size.stock})`).join(" / ")}
                          </div>
                        )) : (
                          <p>尚未設定 variants</p>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <Button onClick={() => startEditProduct(product)} className="h-10 rounded-2xl bg-neutral-900 text-sm">
                          編輯
                        </Button>
                        <Button onClick={() => handleSyncStock(product)} className="h-10 rounded-2xl bg-blue-600 text-sm text-white">
                          同步庫存
                        </Button>
                        <Button onClick={() => deleteProduct(product.id)} className="h-10 rounded-2xl bg-red-100 text-sm text-red-600">
                          刪除
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {tab === "payment-result" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-3xl bg-neutral-50 p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 text-green-500" size={42} />
                <h2 className="text-xl font-black">付款成功</h2>
                <p className="mt-2 text-sm text-neutral-500">
                  {paymentMessage || "正在確認你的訂單狀態"}
                </p>

                <Button
                  onClick={() => setTab("orders")}
                  className="mt-5 rounded-2xl bg-neutral-900"
                >
                  查看我的訂單
                </Button>
              </div>
            </motion.div>
          )}

          {tab === "orders" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h2 className="text-2xl font-black">我的訂單</h2>

              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-neutral-100 p-1">
                {[
                  { key: "all", label: "全部" },
                  { key: "待出貨", label: "待出貨" },
                  { key: "已出貨", label: "已出貨" },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setOrderFilter(item.key)}
                    className={`rounded-xl py-2 text-sm font-black transition ${orderFilter === item.key ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {orders.length === 0 ? (
                <EmptyState title="目前沒有訂單" text="完成結帳後，訂單會出現在這裡。" action={() => setTab("shop")} />
              ) : orders
                .filter((order) => orderFilter === "all" ? true : order.shippingStatus === orderFilter)
                .map((order) => (
                <button
                  key={order.id}
                  onClick={() => {
                    setSelectedOrder(order);
                    setTab("order-detail");
                  }}
                  className="block w-full text-left"
                >
                <Card className="rounded-3xl border-neutral-100 shadow-sm transition hover:shadow-md">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-black">{order.id}</p>
                        <p className="text-xs text-neutral-500">{order.createdAt}</p>
                      </div>
                      <div className="text-right font-black">{formatPrice(order.total)}</div>
                    </div>

                    <OrderStatusSummary order={order} />

                    <div className="flex items-center gap-2 text-sm text-neutral-600"><Package size={16} /> {order.items.length} 件商品</div>
                    {order.items.length > 0 && (
                      <div className="space-y-2 rounded-2xl bg-neutral-50 p-3">
                        {order.items.map((item) => (
                          <div key={item.id || `${item.product_name}-${item.color}-${item.size}`} className="flex items-start justify-between gap-3 text-sm">
                            <div>
                              <p className="font-bold text-neutral-900">{item.product_name || item.name || "商品名稱未載入"}</p>
                              <p className="text-xs text-neutral-500">{item.color} / {item.size} × {item.qty}</p>
                            </div>
                            <p className="font-bold">{formatPrice(item.subtotal ?? (item.unit_price || item.price || 0) * item.qty)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-1 text-sm text-neutral-600">
                      <div className="flex items-center gap-2"><CheckCircle2 size={16} /> {order.delivery === "711" ? "7-11 取貨" : "宅配"}</div>
                      {order.delivery === "711" && order.pickupStore?.store_name && (
                        <p className="pl-6 text-xs text-neutral-500">{order.pickupStore.store_name}｜{order.pickupStore.store_id}<br />{order.pickupStore.address}</p>
                      )}
                      {order.delivery === "home" && order.shippingAddress?.address && (
                        <p className="pl-6 text-xs text-neutral-500">{order.shippingAddress.city}{order.shippingAddress.district}{order.shippingAddress.address}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                </button>
              ))}
            </motion.div>
          )}

          {tab === "order-detail" && selectedOrder && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <button onClick={() => setTab("orders")} className="text-sm font-bold text-neutral-500">← 返回我的訂單</button>

              <Card className="rounded-3xl border-neutral-100 shadow-sm">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-neutral-400">訂單編號</p>
                      <h2 className="text-2xl font-black">#{selectedOrder.id}</h2>
                      <p className="mt-1 text-xs text-neutral-500">{selectedOrder.createdAt}</p>
                    </div>
                  </div>

                  <OrderStatusSummary order={selectedOrder} detailed />

                  <div className="rounded-3xl bg-neutral-50 p-4">
                    <h3 className="mb-3 font-black">商品明細</h3>
                    <div className="space-y-3">
                      {selectedOrder.items.length > 0 ? selectedOrder.items.map((item) => (
                        <div key={item.id || `${item.product_name}-${item.color}-${item.size}`} className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-3 last:border-0 last:pb-0">
                          <div>
                            <p className="font-bold">{item.product_name || item.name || "商品名稱未載入"}</p>
                            <p className="mt-1 text-xs text-neutral-500">{item.color} / {item.size} × {item.qty}</p>
                            <p className="mt-1 text-xs text-neutral-400">單價 {formatPrice(item.unit_price || item.price || 0)}</p>
                          </div>
                          <p className="font-black">{formatPrice(item.subtotal ?? (item.unit_price || item.price || 0) * item.qty)}</p>
                        </div>
                      )) : (
                        <p className="text-sm text-neutral-500">目前沒有商品明細</p>
                      )}
                    </div>
                  </div>

                  {selectedOrder.trackingNo ? (
                    <div className="rounded-3xl bg-neutral-50 p-4">
                      <h3 className="mb-3 font-black">物流資訊</h3>
                      <p className="text-sm text-neutral-600">物流公司：{selectedOrder.shippingCompany || "-"}</p>
                      <p className="mt-1 text-sm text-neutral-600">物流單號：{selectedOrder.trackingNo}</p>
                      {selectedOrder.shippedAt ? (
                        <p className="mt-1 text-sm text-neutral-600">出貨時間：{formatShippedAt(selectedOrder.shippedAt)}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-3xl bg-neutral-50 p-4">
                    <h3 className="mb-3 font-black">配送資訊</h3>
                    {selectedOrder.delivery === "711" ? (
                      <div className="space-y-1 text-sm text-neutral-600">
                        <p className="font-bold text-neutral-900">7-11 取貨</p>
                        <p>{selectedOrder.pickupStore?.store_name || "尚未選擇門市"} {selectedOrder.pickupStore?.store_id && `｜${selectedOrder.pickupStore.store_id}`}</p>
                        <p>{selectedOrder.pickupStore?.address}</p>
                      </div>
                    ) : (
                      <div className="space-y-1 text-sm text-neutral-600">
                        <p className="font-bold text-neutral-900">宅配</p>
                        <p>{selectedOrder.shippingAddress?.city}{selectedOrder.shippingAddress?.district}{selectedOrder.shippingAddress?.address}</p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl bg-neutral-900 p-4 text-white">
                    <div className="flex justify-between text-sm text-neutral-300"><span>商品小計</span><span>{formatPrice(Math.max((selectedOrder.total || 0) - 60, 0))}</span></div>
                    <div className="mt-2 flex justify-between text-sm text-neutral-300"><span>運費</span><span>{formatPrice(60)}</span></div>
                    <div className="mt-3 flex justify-between border-t border-white/20 pt-3 text-lg font-black"><span>總計</span><span>{formatPrice(selectedOrder.total)}</span></div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </main>

        <nav className="sticky bottom-0 grid grid-cols-6 border-t bg-white px-1 py-2">
          <NavButton active={tab === "home"} icon={<Home size={20} />} label="首頁" onClick={() => setTab("home")} />
          <NavButton active={tab === "lookbook" || tab === "lookbook-detail" || tab === "outfit-builder"} icon={<Sparkles size={20} />} label="穿搭" onClick={() => setTab("lookbook")} />
          <NavButton active={tab === "shop"} icon={<Search size={20} />} label="商品" onClick={() => setTab("shop")} />
          <NavButton active={tab === "favorites"} icon={<Heart size={20} />} label="收藏" onClick={() => setTab("favorites")} />
          <NavButton active={tab === "cart"} icon={<ShoppingBag size={20} />} label="購物車" onClick={() => setTab("cart")} />
          <NavButton
            active={tab === "orders"}
            icon={<Package size={20} />}
            label="訂單"
            onClick={() => {
              setTab("orders");
            }}
          />
        </nav>
      </div>
    </div>
  );
}

function HomeLoadingHint({ message = "資料載入中，請稍候" }) {
  return <p className="text-sm font-bold text-neutral-400">{message}</p>;
}

function HorizontalSkeletonCards({ count = 4, className = "h-[188px] w-[150px]" }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`skeleton-card-${index}`}
          className={`shrink-0 animate-pulse rounded-[28px] bg-neutral-100 ${className}`}
        />
      ))}
    </div>
  );
}

function ProductGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={`product-skeleton-${index}`} className="overflow-hidden rounded-3xl bg-neutral-100">
          <div className="h-40 animate-pulse bg-neutral-200" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-16 animate-pulse rounded-full bg-neutral-200" />
            <div className="h-4 w-full animate-pulse rounded bg-neutral-200" />
            <div className="h-4 w-20 animate-pulse rounded bg-neutral-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderStatusSummary({ order, detailed = false }) {
  const paymentLabel = formatPaymentStatus(order.status);
  const shippingLabel = formatShippingStatus(order.shippingStatus, order.status);
  const trackingLabel = formatTrackingNo(order.trackingNo);

  return (
    <div className={`rounded-2xl bg-neutral-50 ${detailed ? "p-4" : "p-3"}`}>
      {detailed ? <h3 className="mb-3 font-black">訂單狀態</h3> : null}
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-neutral-500">付款狀態</span>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${getPaymentStatusClass(order.status)}`}>
            {paymentLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-neutral-500">出貨狀態</span>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${getShippingStatusClass(shippingLabel)}`}>
            {shippingLabel}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="font-bold text-neutral-500">物流單號</span>
          <span className={`text-right font-black ${order.trackingNo ? "text-neutral-900" : "text-neutral-400"}`}>
            {trackingLabel}
          </span>
        </div>
        {detailed && order.trackingNo && order.shippingCompany ? (
          <div className="flex items-start justify-between gap-3">
            <span className="font-bold text-neutral-500">物流公司</span>
            <span className="text-right font-black text-neutral-900">{order.shippingCompany}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FavoriteHeartButton({ isFavorite, onToggle, className = "h-9 w-9" }) {
  return (
    <button
      type="button"
      aria-label={isFavorite ? "取消收藏" : "加入收藏"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle?.();
      }}
      className={`flex items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow-sm ring-1 ring-neutral-100 ${className}`}
    >
      <Heart
        size={18}
        className={isFavorite ? "fill-red-500 text-red-500" : "text-neutral-700"}
      />
    </button>
  );
}

function ProductCard({ product, onClick, isFavorite = false, onToggleFavorite }) {
  return (
    <div className="relative">
      <button type="button" onClick={onClick} className="w-full text-left">
        <Card className="overflow-hidden rounded-3xl border-neutral-100 shadow-sm transition hover:shadow-md">
          <div className="relative">
            <img src={product.image} alt={product.name} className="h-40 w-full object-cover" />
          </div>
          <CardContent className="p-3">
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-600">{product.tag}</span>
            <h3 className="mt-2 line-clamp-2 font-bold leading-tight">{product.name}</h3>
            <p className="mt-1 text-sm font-black">{formatPrice(product.price)}</p>
          </CardContent>
        </Card>
      </button>
      {onToggleFavorite ? (
        <div className="absolute right-3 top-3 z-10">
          <FavoriteHeartButton
            isFavorite={isFavorite}
            onToggle={() => onToggleFavorite(product.id)}
          />
        </div>
      ) : null}
    </div>
  );
}

function RankingProductCard({
  product,
  rank,
  metricLabel,
  onClick,
  isFavorite = false,
  onToggleFavorite,
  compact = false,
}) {
  const rankBadgeClass = rank <= 3 ? "bg-neutral-900 text-white" : "bg-white/90 text-neutral-700";

  return (
    <div className={`relative shrink-0 ${compact ? "w-[150px]" : "w-full"}`}>
      <button type="button" onClick={onClick} className="w-full text-left">
        <Card className="overflow-hidden rounded-3xl border-neutral-100 shadow-sm transition hover:shadow-md">
          <div className="relative">
            <img src={product.image} alt={product.name} className={`w-full object-cover ${compact ? "h-36" : "h-40"}`} />
            <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-black ${rankBadgeClass}`}>
              #{rank}
            </span>
          </div>
          <CardContent className="p-3">
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-bold text-neutral-600">{product.tag}</span>
            <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-tight">{product.name}</h3>
            <p className="mt-1 text-sm font-black">{formatPrice(product.price)}</p>
            {metricLabel ? (
              <p className="mt-2 text-[11px] font-bold text-neutral-500">{metricLabel}</p>
            ) : null}
          </CardContent>
        </Card>
      </button>
      {onToggleFavorite ? (
        <div className="absolute right-3 top-3 z-10">
          <FavoriteHeartButton
            isFavorite={isFavorite}
            onToggle={() => onToggleFavorite(product.id)}
          />
        </div>
      ) : null}
    </div>
  );
}

function RankingLookbookCard({
  lookbook,
  rank,
  metricLabel,
  onClick,
  isFavorite = false,
  onToggleFavorite,
}) {
  const rankBadgeClass = rank <= 3 ? "bg-neutral-900 text-white" : "bg-white/90 text-neutral-700";

  return (
    <div className="relative w-[150px] shrink-0">
      <button type="button" onClick={onClick} className="w-full text-left">
        <Card className="overflow-hidden rounded-3xl border-neutral-100 shadow-sm transition hover:shadow-md">
          <div className="relative aspect-[3/4] bg-neutral-100">
            <img src={lookbook.image} alt={lookbook.title} className="h-full w-full object-cover" />
            <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-black ${rankBadgeClass}`}>
              #{rank}
            </span>
          </div>
          <CardContent className="space-y-2 p-3">
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-bold text-neutral-600">{lookbook.tag}</span>
            <h3 className="line-clamp-2 text-sm font-black leading-tight">{lookbook.title}</h3>
            {metricLabel ? (
              <p className="text-[11px] font-bold text-neutral-500">{metricLabel}</p>
            ) : null}
          </CardContent>
        </Card>
      </button>
      {onToggleFavorite ? (
        <div className="absolute right-3 top-3 z-10">
          <FavoriteHeartButton
            isFavorite={isFavorite}
            onToggle={() => onToggleFavorite(lookbook.id)}
          />
        </div>
      ) : null}
    </div>
  );
}

function ProductAccordion({ sections }) {
  const [openKeys, setOpenKeys] = useState(new Set());

  const toggleSection = (key) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const visibleSections = sections.filter((section) => {
    if (!section.content) return false;
    if (typeof section.content === "string") return section.content.trim().length > 0;
    return true;
  });

  if (visibleSections.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibleSections.map((section) => {
        const isOpen = openKeys.has(section.key);

        return (
          <div key={section.key} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <button
              type="button"
              onClick={() => toggleSection(section.key)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-black text-neutral-900">{section.title}</span>
              <ChevronDown
                size={18}
                className={`text-neutral-400 transition ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen ? <div className="border-t border-neutral-100 px-4 py-4">{section.content}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function OptionGroup({ title, options, value, setValue, disabledOptions = [], stockMap = {}, statusMap = {} }) {
  return (
    <section>
      <h3 className="mb-3 font-bold">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const status = statusMap[option] || "unknown";
          const isSoldOut = status === "out_of_stock" || disabledOptions.includes(option);
          const isDisabled = isSoldOut;
          const stock = stockMap[option];
          const stockLabel = getStockDisplayLabel(status, stock);

          return (
            <button
              key={option}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && setValue(option)}
              className={`min-w-[72px] rounded-2xl border px-4 py-2 text-sm font-bold ${
                isDisabled
                  ? "cursor-not-allowed border-neutral-100 bg-neutral-100 text-neutral-400"
                  : value === option
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-700"
              }`}
            >
              <span>{option}</span>
              {stockLabel ? (
                <span className={`mt-0.5 block text-[10px] font-bold ${
                  stockLabel === "已售完"
                    ? "text-neutral-400"
                    : stockLabel === "剩少量"
                      ? value === option ? "text-red-200" : "text-red-500"
                      : value === option ? "text-neutral-300" : "text-green-600"
                }`}>
                  {stockLabel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SizeTableJsonTable({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const columns = getSizeTableColumns(rows);

  return (
    <div>
      <p className="mb-2 text-sm font-black">尺寸表</p>
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-center text-sm">
            <thead className="bg-neutral-100 text-neutral-700">
              <tr>
                {columns.map((field) => (
                  <th key={field} className="border-b border-neutral-200 px-3 py-3 font-black">
                    {SIZE_TABLE_FIELD_LABELS[field]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${row.size}-${rowIndex}`} className="odd:bg-white even:bg-neutral-50">
                  {columns.map((field) => (
                    <td
                      key={`${row.size}-${field}`}
                      className={`border-b border-neutral-100 px-3 py-3 ${field === "size" ? "font-black text-neutral-900" : "text-neutral-600"}`}
                    >
                      {row[field] || "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-neutral-400">尺寸單位：cm。人工測量可能有 1–3cm 誤差。</p>
    </div>
  );
}

function parseSizeChart(sizeChart) {
  if (!sizeChart) return [];

  return String(sizeChart)
    .trim()
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split(/[,，\t]/).map((cell) => cell.trim()).filter(Boolean));
}

function SizeChartTable({ sizeChart }) {
  const rows = parseSizeChart(sizeChart);

  if (rows.length < 2 || rows[0].length < 2) {
    return (
      <div>
        <p className="mb-2 text-sm font-black">尺寸表</p>
        <pre className="whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm leading-6 text-neutral-700">{sizeChart}</pre>
      </div>
    );
  }

  const headers = rows[0];
  const bodyRows = rows.slice(1);

  return (
    <div>
      <p className="mb-2 text-sm font-black">尺寸表</p>
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-center text-sm">
            <thead className="bg-neutral-100 text-neutral-700">
              <tr>
                {headers.map((header) => (
                  <th key={header} className="border-b border-neutral-200 px-3 py-3 font-black">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={`${row.join("-")}-${rowIndex}`} className="odd:bg-white even:bg-neutral-50">
                  {headers.map((header, cellIndex) => (
                    <td key={`${header}-${cellIndex}`} className={`border-b border-neutral-100 px-3 py-3 ${cellIndex === 0 ? "font-black text-neutral-900" : "text-neutral-600"}`}>
                      {row[cellIndex] || "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-neutral-400">尺寸單位：cm。人工測量可能有 1–3cm 誤差。</p>
    </div>
  );
}

function DetailBlock({ title, text }) {
  if (!text) return null;

  return (
    <div>
      <p className="mb-1 text-sm font-black">{title}</p>
      <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-600">{text}</p>
    </div>
  );
}

function TextArea({ label, placeholder, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold">{label}</span>
      <textarea
        className="min-h-[96px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-neutral-900"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </label>
  );
}

function Input({ label, placeholder, value, onChange, type = "text", icon }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold">{label}</span>
      <div className="flex h-12 items-center gap-2 rounded-2xl border border-neutral-200 px-4 focus-within:border-neutral-900">
        {icon && <span className="text-neutral-400">{icon}</span>}
        <input
          className="h-full flex-1 bg-transparent outline-none"
          placeholder={placeholder}
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>
    </label>
  );
}

function DeliveryButton({ active, onClick, icon, title }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-2 rounded-2xl border p-4 font-bold ${active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white"}`}>
      {icon}{title}
    </button>
  );
}

function PriceBox({ subtotal, shipping, total }) {
  return (
    <Card className="rounded-3xl border-neutral-100 bg-neutral-50">
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex justify-between"><span>商品小計</span><span>{formatPrice(subtotal)}</span></div>
        <div className="flex justify-between"><span>運費</span><span>{formatPrice(shipping)}</span></div>
        <div className="flex justify-between border-t pt-2 text-base font-black"><span>總計</span><span>{formatPrice(total)}</span></div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, text, action }) {
  return (
    <div className="rounded-3xl bg-neutral-50 p-8 text-center">
      <ShoppingBag className="mx-auto mb-3 text-neutral-400" size={36} />
      <h3 className="font-black">{title}</h3>
      <p className="mt-1 text-sm text-neutral-500">{text}</p>
      <Button onClick={action} className="mt-4 rounded-2xl bg-neutral-900">去逛逛</Button>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-xs font-bold ${active ? "bg-neutral-100 text-neutral-900" : "text-neutral-400"}`}>
      {icon}
      {label}
    </button>
  );
}
