// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect } from "react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { ShoppingBag, Search, Home, User, Package, Trash2, Plus, Minus, MapPin, Truck, Store, CheckCircle2, Mail, Lock, LogOut, Sparkles } from "lucide-react";

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

function formatModelInfo(product) {
  if (!product) return "";

  const height = product.modelHeight;
  const weight = product.modelWeight;
  const size = product.modelSize;

  if (!height && !weight && !size) return "";

  const body = [
    height ? `${height}cm` : "",
    weight ? `${weight}kg` : "",
  ].filter(Boolean).join(" / ");

  if (body && size) return `${body} 著用 ${size} size`;
  if (body) return body;
  return `著用 ${size} size`;
}


const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "FREE"];

function normalizeSizeName(size) {
  return String(size || "").trim().toUpperCase();
}

function getAvailableSizeNames(product) {
  const fromVariants = (product?.variants || [])
    .flatMap((variant) => variant.sizes || [])
    .filter((size) => Number(size.stock ?? 999) > 0)
    .map((size) => normalizeSizeName(size.name))
    .filter(Boolean);

  const fromSizes = (product?.sizes || []).map(normalizeSizeName).filter(Boolean);
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

function moveSize(size, diff, availableSizes = []) {
  const normalized = normalizeSizeName(size);
  const candidates = availableSizes.length ? availableSizes : SIZE_ORDER;
  const index = candidates.indexOf(normalized);

  if (index === -1) return normalized || candidates[0] || "";
  return candidates[Math.max(0, Math.min(candidates.length - 1, index + diff))];
}

function buildFitRecommendation(product, sizeAI) {
  const userHeight = Number(sizeAI.height);
  const userWeight = Number(sizeAI.weight);
  const modelHeight = Number(product?.modelHeight);
  const modelWeight = Number(product?.modelWeight);
  const modelSize = normalizeSizeName(product?.modelSize);
  const availableSizes = getAvailableSizeNames(product).filter((size) => size !== "FREE");

  if (!userHeight || !userWeight) {
    return { size: "", reason: "請輸入身高與體重，系統會依 Model 參考推薦尺寸。", details: [] };
  }

  if (!modelSize || !modelHeight || !modelWeight) {
    return { size: "", reason: "此商品尚未設定 Model 身高、體重或著用尺寸。", details: [] };
  }

  if (modelSize === "FREE") {
    return {
      size: "FREE",
      reason: "此商品為 FREE SIZE，建議參考商品尺寸表與版型。",
      details: [`Model ${modelHeight}cm / ${modelWeight}kg 著用 FREE size`],
    };
  }

  const heightDiff = userHeight - modelHeight;
  const weightDiff = userWeight - modelWeight;
  let step = 0;

  if (weightDiff >= 10 || heightDiff >= 8) step = 1;
  else if (weightDiff <= -10 && heightDiff <= -5) step = -1;
  else if (weightDiff >= 6 && heightDiff >= 4) step = 1;
  else if (weightDiff <= -8) step = -1;

  const size = moveSize(modelSize, step, availableSizes);
  const direction = step > 0 ? "大一號" : step < 0 ? "小一號" : "同尺寸";

  return {
    size,
    reason: `你比 Model ${heightDiff >= 0 ? "高" : "矮"}${Math.abs(heightDiff)}cm、${weightDiff >= 0 ? "重" : "輕"}${Math.abs(weightDiff)}kg，建議先選 ${direction}。`,
    details: [
      `Model ${modelHeight}cm / ${modelWeight}kg 著用 ${modelSize} size`,
      step === 0 ? "身形差距不大，建議選 Model 著用尺寸。" : "若想穿更寬鬆，可再往上選一碼。",
    ],
  };
}

const XANO_CHECKOUT_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/checkout";
const XANO_ADD_ORDER_ITEM_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/add-order-item";
const XANO_GET_ORDERS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/Get_Orders";
const XANO_GET_ORDER_ITEMS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/order-items";
const XANO_PRODUCTS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/products";
const XANO_CREATE_ECPAY_ORDER_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/create-ecpay-order";
const XANO_CREATE_CVS_MAP_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/create-cvs-map";
const XANO_DECREASE_STOCK_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/decrease-stock";
const XANO_LOOKBOOKS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/lookbooks";
const XANO_UPDATE_ORDER_SHIPPING_STATUS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-order-shipping-status";
const XANO_UPDATE_TRACKING_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/update-tracking";
const XANO_ADMIN_ORDERS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-orders";
const XANO_ADMIN_CREATE_PRODUCT_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-create-product";
const XANO_ADMIN_UPDATE_PRODUCT_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-update-product";
const XANO_ADMIN_DELETE_PRODUCT_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-delete-product";
const XANO_RECALCULATE_PRODUCTS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/admin-recalculate-all-products";

export default function JGoAppPrototype() {
  const { user, isSignedIn } = useUser();
  const [tab, setTab] = useState("home");
  const [products, setProducts] = useState([]);
  const [lookbooks, setLookbooks] = useState([]);
  const [selectedLookbook, setSelectedLookbook] = useState(null);
  const [outfitSelections, setOutfitSelections] = useState({});
  const [activeGender, setActiveGender] = useState("all");
  const [activeBrand, setActiveBrand] = useState("all");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [cart, setCart] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const savedCart = localStorage.getItem("jgo_cart");
      const parsedCart = savedCart ? JSON.parse(savedCart) : [];
      return Array.isArray(parsedCart) ? parsedCart : [];
    } catch {
      return [];
    }
  });
  const [delivery, setDelivery] = useState(() => {
    if (typeof window === "undefined") return "711";
    return localStorage.getItem("jgo_delivery") || "711";
  });
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderFilter, setOrderFilter] = useState("all");
  const [trackingForms, setTrackingForms] = useState({});
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
    localStorage.setItem("jgo_cart", JSON.stringify(cart));
  }, [cart]);

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

      setPaymentMessage("付款成功，正在更新訂單...");
      setTab("payment-result");
      refreshProductsFromXano({ useCache: false });

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

      return {
        id: product.id,
        name: product.name,
        brand: product.brand,
        price: product.price,
        jpyPrice: product.jpy_price,
        compareAt: product.compare_at,
        image: images[0] || product.image,
        images,
        colors: product.colors ? product.colors.split(",").map((color) => color.trim()).filter(Boolean) : [],
        sizes: product.sizes ? product.sizes.split(",").map((size) => size.trim()).filter(Boolean) : [],
        variants: product.variants
          ? product.variants.split(";").map((variant) => {
              const [color, ...sizeParts] = variant.split(":");
              const sizeText = sizeParts.join(":");
              return {
                color: color?.trim(),
                sizes: sizeText
                  ? sizeText.split(",").map((sizeItem) => {
                      const [sizeName, stockText] = sizeItem.split(":");
                      return {
                        name: sizeName?.trim(),
                        stock: Number(stockText ?? 999),
                      };
                    }).filter((size) => size.name)
                  : [],
              };
            })
          : [],
        tag: product.tag || "日本選品",
        gender: product.gender || "unisex",
        description: product.description || "",
        material: product.material || "",
        fit: product.fit || "",
        modelHeight: product.model_height || "",
        modelWeight: product.model_weight || "",
        modelSize: product.model_size || "",
        recommendedHeight: product.recommended_height || "",
        recommendedWeight: product.recommended_weight || "",
        sizeChart: product.size_chart || "",
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
    const activeVariant = activeProduct.variants?.find((variant) => variant.color === selectedColor) || activeProduct.variants?.[0];
    const nextColor = activeVariant?.color || activeProduct.colors?.[0] || "";
    const nextSize = activeVariant?.sizes?.find((size) => size.name === selectedSize && size.stock > 0)?.name
      || activeVariant?.sizes?.find((size) => size.stock > 0)?.name
      || activeVariant?.sizes?.[0]?.name
      || activeProduct.sizes?.[0]
      || "";

    setSelectedColor(nextColor);
    setSelectedSize(nextSize);
    setSelectedImageIndex(0);
  };

  const refreshProductsFromXano = async ({ useCache = true } = {}) => {
    setLoadingProducts(true);

    if (useCache) {
      const cachedProducts = localStorage.getItem("jgo_products_cache");
      if (cachedProducts) {
        const parsedProducts = JSON.parse(cachedProducts);
        if (Array.isArray(parsedProducts) && parsedProducts.length > 0) {
          applyProducts(parsedProducts);
          setLoadingProducts(false);
        }
      }
    }

    try {
      const response = await fetch(`${XANO_PRODUCTS_URL}?t=${Date.now()}`);

      if (!response.ok) {
        throw new Error("商品 API 載入失敗");
      }

      const data = await response.json();
      const productList = Array.isArray(data) ? data : [];
      const formattedProducts = formatXanoProducts(productList);

      if (formattedProducts.length > 0) {
        localStorage.setItem("jgo_products_cache", JSON.stringify(formattedProducts));
        applyProducts(formattedProducts);
      }
    } catch (error) {
      console.error("讀取商品失敗", error);
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    refreshProductsFromXano({ useCache: true });
    loadLookbooks();
  }, []);

  const loadLookbooks = async () => {
    try {
      const response = await fetch(`${XANO_LOOKBOOKS_URL}?t=${Date.now()}`);
      if (!response.ok) throw new Error(`讀取 Lookbook 失敗：${response.status}`);

      const data = await response.json();
      const list = Array.isArray(data) ? data : data?.items || [];

      setLookbooks(list.map((lookbook) => ({
        id: lookbook.id,
        title: lookbook.title || "J-GO Lookbook",
        image: lookbook.image,
        tag: lookbook.tag || lookbook.style_tag || "AI LOOKBOOK",
        gender: lookbook.gender || "unisex",
        product_ids: String(lookbook.product_ids || "")
          .split(",")
          .map((id) => Number(id.trim()))
          .filter(Boolean),
        raw_product_ids: lookbook.product_ids || "",
      })));
    } catch (error) {
      console.error(error);
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

      await refreshProductsFromXano({ useCache: false });
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
      await refreshProductsFromXano({ useCache: false });
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

      await refreshProductsFromXano({ useCache: false });
      alert("商品已刪除");
    } catch (error) {
      console.error(error);
      alert(error.message || "刪除商品失敗");
    }
  };

  const filteredProducts = products.filter((product) => {
    const genderMatched = activeGender === "all"
      ? true
      : activeGender === "unisex"
        ? product.gender === "unisex"
        : product.gender === activeGender || product.gender === "unisex";

    const brandMatched = activeBrand === "all" || product.brand === activeBrand;

    return genderMatched && brandMatched;
  });

  const brandOptions = ["all", ...Array.from(new Set(products.map((product) => product.brand).filter(Boolean)))];
  const homeBrandOptions = brandOptions.filter((brand) => brand !== "all").slice(0, 8);
  const featuredProduct = filteredProducts[0] || products[0];

  const shipping = subtotal > 0 ? 60 : 0;
  const total = subtotal + shipping;

  const openProduct = (product) => {
    setSelectedProduct(product);
    setSelectedColor(product.variants?.[0]?.color || product.colors[0]);
    setSelectedSize(product.variants?.[0]?.sizes?.find((size) => size.stock > 0)?.name || product.variants?.[0]?.sizes?.[0]?.name || product.sizes[0]);
    setSelectedImageIndex(0);
    setTab("product");
  };

  const requireLogin = (targetTab = "account") => {
    alert("請先登入會員");
    setTab(targetTab);
    return false;
  };

  const addToCart = () => {
    if (!isSignedIn || !currentUser) return requireLogin();

    if (!selectedSize || selectedSizeStock <= 0) {
      alert("這個顏色 / 尺寸目前缺貨");
      return;
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
    setTab("cart");
  };

  const getLookbookProducts = (lookbook) => {
    if (!lookbook?.product_ids?.length) return [];
    return products.filter((product) => lookbook.product_ids.includes(Number(product.id)));
  };

  const getDefaultOutfitSelection = (product) => {
    const firstVariant = product?.variants?.find((variant) =>
      variant.sizes?.some((size) => Number(size.stock ?? 999) > 0)
    ) || product?.variants?.[0];
    const firstAvailableSize = firstVariant?.sizes?.find((size) => Number(size.stock ?? 999) > 0) || firstVariant?.sizes?.[0];

    return {
      color: firstVariant?.color || product?.colors?.[0] || "",
      size: firstAvailableSize?.name || product?.sizes?.[0] || "",
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

  const getProductSizeOptionsByColor = (product, color) => {
    const variant = product?.variants?.find((item) => item.color === color);
    return variant?.sizes?.length
      ? variant.sizes
      : (product?.sizes || []).map((size) => ({ name: size, stock: 999 }));
  };

  const addOutfitSelectionsToCart = () => {
    if (!isSignedIn || !currentUser) return requireLogin();

    const relatedProducts = getLookbookProducts(selectedLookbook);

    if (relatedProducts.length === 0) {
      alert("這套穿搭還沒有綁定商品");
      return;
    }

    const nextItems = [];

    for (const product of relatedProducts) {
      const selection = outfitSelections[product.id] || {};
      const color = selection.color;
      const size = selection.size;
      const sizeOptions = getProductSizeOptionsByColor(product, color);
      const selectedSizeOption = sizeOptions.find((item) => item.name === size);
      const stock = Number(selectedSizeOption?.stock ?? 999);

      if (!color || !size) {
        alert(`請先選擇「${product.name}」的顏色與尺寸`);
        return;
      }

      if (stock <= 0) {
        alert(`「${product.name}」${color} / ${size} 目前缺貨`);
        return;
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

  const currentVariant = selectedProduct?.variants?.find(
    (variant) => variant.color === selectedColor
  );

  const availableSizeOptions = currentVariant?.sizes?.length
    ? currentVariant.sizes
    : (selectedProduct?.sizes || []).map((size) => ({ name: size, stock: 999 }));

  const availableSizes = availableSizeOptions.map((size) => size.name);
  const selectedSizeStock = availableSizeOptions.find((size) => size.name === selectedSize)?.stock ?? 999;

  const fitRecommendation = useMemo(() => buildFitRecommendation(selectedProduct, sizeAI), [selectedProduct, sizeAI]);
  const recommendedSize = fitRecommendation.size;

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

  const updateOrderTracking = async (order) => {
    if (!isAdmin) return;

    const form = trackingForms[order.id] || {};
    const trackingNo = (form.trackingNo ?? order.trackingNo ?? "").trim();
    const shippingCompany = (form.shippingCompany ?? order.shippingCompany ?? "").trim();

    if (!trackingNo) {
      alert("請輸入物流單號");
      return;
    }

    if (!shippingCompany) {
      alert("請輸入物流公司，例如 7-11、全家、黑貓");
      return;
    }

    try {
      const response = await fetch(XANO_UPDATE_TRACKING_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.id,
          tracking_no: trackingNo,
          shipping_company: shippingCompany,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`更新物流失敗：${response.status}，${text}`);
      }

      setOrders((prev) => prev.map((item) => item.id === order.id ? {
        ...item,
        trackingNo,
        shippingCompany,
        shippingStatus: "已出貨",
      } : item));

      setSelectedOrder((prev) => prev?.id === order.id ? {
        ...prev,
        trackingNo,
        shippingCompany,
        shippingStatus: "已出貨",
      } : prev);

      setTrackingForms((prev) => ({
        ...prev,
        [order.id]: { trackingNo, shippingCompany },
      }));

      alert("物流資訊已更新");
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

      await refreshProductsFromXano({ useCache: false });

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
              {cart.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-xs">{cart.length}</span>}
            </button>
          </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5 pb-24">
          {tab === "home" && (
            loadingProducts ? (
              <div className="flex h-64 items-center justify-center text-neutral-400 font-bold">
                商品載入中...
              </div>
            ) : (
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

              <section className="relative overflow-hidden rounded-[2rem] bg-neutral-900 shadow-2xl">
                <div className="absolute inset-0 grid grid-cols-2">
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

                <div className="relative z-10 min-h-[320px] px-6 py-5 text-white">
                  <div className="flex justify-end">
                    <span className="rounded-full bg-neutral-950/90 px-4 py-1.5 text-[10px] font-black text-white shadow-lg backdrop-blur">NEW DROP</span>
                  </div>

                  <div className="mt-16 max-w-[285px]">
                    <p className="text-sm font-black text-white/90">日系穿搭 × AI LOOKBOOK × 整套購買</p>
                    <h2 className="mt-3 text-[2.7rem] font-black leading-[0.92] tracking-tight drop-shadow">
                      Find your<br />Japan fit.
                    </h2>
                    <p className="mt-4 max-w-[260px] text-sm font-bold leading-6 text-white/90">
                      從 AI Lookbook 找靈感，依品牌、風格快速逛到整套穿搭。
                    </p>
                    <button onClick={() => setTab("lookbook")} className="mt-5 rounded-2xl bg-white px-7 py-3 text-sm font-black text-neutral-950 shadow-xl transition active:scale-[0.98]">
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

                {lookbooks.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
                    {lookbooks.slice(0, 4).map((lookbook, index) => (
                      <button
                        key={lookbook.id}
                        onClick={() => {
                          setSelectedLookbook(lookbook);
                          setTab("lookbook-detail");
                        }}
                        className="group relative h-[218px] min-w-[150px] overflow-hidden rounded-[1.6rem] bg-neutral-100 text-left shadow-[0_14px_30px_rgba(0,0,0,0.1)] transition active:scale-[0.98]"
                      >
                        <img src={lookbook.image} alt={lookbook.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                        <span className="absolute left-3 top-3 rounded-full bg-neutral-950/90 px-2.5 py-1 text-[10px] font-black text-white">{String(index + 1).padStart(2, "0")}</span>
                        <div className="absolute bottom-3 left-3 right-3 text-white">
                          <p className="text-[15px] font-black leading-tight">{lookbook.tag || "STYLE"}</p>
                          <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-4 text-white/85">{lookbook.title}</p>
                          <span className="mt-3 inline-block rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-black text-neutral-900">查看整套</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[1.6rem] bg-neutral-50 p-5 text-sm font-bold text-neutral-400">
                    目前還沒有 Lookbook，新增後會自動出現在這裡。
                  </div>
                )}
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
                      onClick={() => {
                        setActiveBrand(brand);
                        setActiveGender("all");
                        setTab("shop");
                      }}
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
                  <h3 className="text-xl font-black tracking-tight">新品上架</h3>
                  <button onClick={() => setTab("shop")} className="text-xs font-black text-neutral-500">看全部 ›</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {filteredProducts
                    .slice(0, 4)
                    .map((product) => <ProductCard key={product.id} product={product} onClick={() => openProduct(product)} />)}
                </div>
              </section>
            </motion.div>
            )
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

              <div className="space-y-4">
                {getLookbookProducts(selectedLookbook).map((product) => {
                  const selection = outfitSelections[product.id] || getDefaultOutfitSelection(product);
                  const colorOptions = product.variants?.length
                    ? product.variants.map((variant) => variant.color).filter(Boolean)
                    : product.colors || [];
                  const sizeOptions = getProductSizeOptionsByColor(product, selection.color);
                  const sizeNames = sizeOptions.map((item) => item.name);
                  const disabledSizeNames = sizeOptions.filter((item) => Number(item.stock ?? 999) <= 0).map((item) => item.name);
                  const stockMap = Object.fromEntries(sizeOptions.map((item) => [item.name, Number(item.stock ?? 999)]));

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
                            const nextSize = nextSizeOptions.find((item) => Number(item.stock ?? 999) > 0)?.name || nextSizeOptions[0]?.name || "";
                            updateOutfitSelection(product.id, { color, size: nextSize });
                          }}
                        />

                        <OptionGroup
                          title="尺寸"
                          options={sizeNames}
                          value={selection.size}
                          setValue={(size) => updateOutfitSelection(product.id, { size })}
                          disabledOptions={disabledSizeNames}
                          stockMap={stockMap}
                        />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="sticky bottom-20 z-10 rounded-[2rem] border border-neutral-100 bg-white/95 p-4 shadow-2xl backdrop-blur">
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
                      <ProductCard key={product.id} product={product} onClick={() => openProduct(product)} />
                    ))}
                </div>
              </section>
            </motion.div>
          )}

          {tab === "shop" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="flex items-center gap-2 rounded-2xl bg-neutral-100 px-4 py-3">
                <Search size={18} className="text-neutral-400" />
                <span className="text-sm text-neutral-500">搜尋日系襯衫、寬褲、外套</span>
              </div>

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
                      onClick={() => setActiveBrand(brand)}
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
                {(activeGender !== "all" || activeBrand !== "all") && (
                  <button
                    onClick={() => {
                      setActiveGender("all");
                      setActiveBrand("all");
                    }}
                    className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-black text-neutral-600"
                  >
                    清除篩選
                  </button>
                )}
              </div>

              {filteredProducts.length === 0 ? (
                <div className="rounded-[2rem] bg-neutral-50 p-8 text-center">
                  <h3 className="font-black">目前沒有符合的商品</h3>
                  <p className="mt-1 text-sm text-neutral-500">可以切換性別或品牌分類看看。</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredProducts.map((product) => <ProductCard key={product.id} product={product} onClick={() => openProduct(product)} />)}
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
              <div>
                <p className="text-sm text-neutral-500">{selectedProduct.brand}</p>
                <h2 className="text-2xl font-black">{selectedProduct.name}</h2>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-xl font-black">{formatPrice(selectedProduct.price)}</span>
                  <span className="text-sm text-neutral-400 line-through">{formatPrice(selectedProduct.compareAt)}</span>
                </div>
              </div>
              <OptionGroup
                title="顏色"
                options={selectedProduct.colors}
                value={selectedColor}
                setValue={(color) => {
                  const nextVariant = selectedProduct.variants?.find((variant) => variant.color === color);
                  const firstAvailableSize = nextVariant?.sizes?.find((size) => size.stock > 0)?.name || nextVariant?.sizes?.[0]?.name || "";
                  setSelectedColor(color);
                  setSelectedSize(firstAvailableSize);
                }}
              />
              <OptionGroup
                title="尺寸"
                options={availableSizes}
                value={selectedSize}
                setValue={setSelectedSize}
                disabledOptions={availableSizeOptions.filter((size) => size.stock <= 0).map((size) => size.name)}
                stockMap={Object.fromEntries(availableSizeOptions.map((size) => [size.name, size.stock]))}
              />
              {selectedSize && selectedSizeStock <= 3 && selectedSizeStock > 0 && (
                <p className="text-sm font-bold text-red-500">此尺寸只剩 {selectedSizeStock} 件</p>
              )}
              {selectedSize && selectedSizeStock <= 0 && (
                <p className="text-sm font-bold text-red-500">此尺寸目前缺貨</p>
              )}
              {(selectedProduct.description || selectedProduct.material || selectedProduct.fit || formatModelInfo(selectedProduct) || selectedProduct.sizeChart) && (
                <Card className="rounded-3xl border-neutral-100 bg-neutral-50 shadow-sm">
                  <CardContent className="space-y-5 p-5">
                    <div>
                      <p className="text-xs font-black tracking-widest text-neutral-400">PRODUCT DETAILS</p>
                      <h3 className="mt-1 text-lg font-black">商品介紹與尺寸表</h3>
                    </div>

                    {selectedProduct.description && (
                      <DetailBlock title="商品介紹" text={selectedProduct.description} />
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      {selectedProduct.material && <DetailBlock title="材質" text={selectedProduct.material} />}
                      {selectedProduct.fit && <DetailBlock title="版型" text={selectedProduct.fit} />}
                    </div>

                    {formatModelInfo(selectedProduct) && (
                      <DetailBlock title="Model 參考" text={formatModelInfo(selectedProduct)} />
                    )}

                    {selectedProduct.sizeChart && (
                      <SizeChartTable sizeChart={selectedProduct.sizeChart} />
                    )}
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
                      label="體重"
                      placeholder="68"
                      value={sizeAI.weight}
                      onChange={(value) => setSizeAI({ ...sizeAI, weight: value })}
                    />
                  </div>

                  {recommendedSize && (
                    <div className="space-y-3 rounded-3xl bg-neutral-900 p-5 text-white">
                      <div>
                        <p className="text-xs font-bold tracking-widest text-neutral-400">AI FIT REPORT</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-4xl font-black">{recommendedSize}</p>
                            <p className="mt-1 text-sm text-neutral-300">
                              {sizeAI.gender === "male" ? "男性" : "女性"}｜{sizeAI.height}cm / {sizeAI.weight}kg
                            </p>
                          </div>
                          <button
                            onClick={() => setSelectedSize(recommendedSize)}
                            className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-neutral-900"
                          >
                            使用此尺寸
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/10 p-4 text-sm leading-6 text-neutral-200">
                        <p>✔ {fitRecommendation.reason}</p>
                        <p>✔ 建議版型：{selectedProduct.fit || "正常偏寬鬆"}</p>
                        <p>✔ 想穿 Oversize：可選大一號</p>

                        <div className="mt-3 border-t border-white/10 pt-3">
                          <p className="font-bold text-white">Model 參考</p>
                          <p className="mt-1">{formatModelInfo(selectedProduct) || "尚未設定 Model 資訊"}</p>
                          {fitRecommendation.details?.map((detail) => (
                            <p key={detail} className="mt-1 text-xs text-neutral-300">{detail}</p>
                          ))}
                        </div>

                        {(selectedProduct.recommendedHeight || selectedProduct.recommendedWeight) && (
                          <div className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-xs text-neutral-300">
                            商品建議範圍：{selectedProduct.recommendedHeight || "-"}cm / {selectedProduct.recommendedWeight || "-"}kg
                          </div>
                        )}

                        <div className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-xs text-neutral-300">
                          目前為 Model 參考推估版，之後可接肩寬、胸寬、腰圍做更精準推薦。
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button onClick={addToCart} className="h-12 w-full rounded-2xl bg-neutral-900 text-base">加入購物車</Button>
              {!currentUser && <p className="text-center text-sm text-neutral-400">登入後才能加入購物車與結帳</p>}
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

                    <SignInButton mode="modal">
                      <button className="h-12 w-full rounded-2xl bg-neutral-900 text-base font-black text-white">
                        登入會員
                      </button>
                    </SignInButton>

                    <SignUpButton mode="modal">
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
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={trackingForms[order.id]?.shippingCompany ?? order.shippingCompany ?? ""}
                                onChange={(e) => updateTrackingForm(order.id, "shippingCompany", e.target.value)}
                                placeholder="物流公司，例如 7-11"
                                className="h-11 rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-bold outline-none"
                              />
                              <input
                                value={trackingForms[order.id]?.trackingNo ?? order.trackingNo ?? ""}
                                onChange={(e) => updateTrackingForm(order.id, "trackingNo", e.target.value)}
                                placeholder="物流單號"
                                className="h-11 rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-bold outline-none"
                              />
                            </div>
                            {(order.shippingCompany || order.trackingNo) && (
                              <p className="mt-2 text-xs font-bold text-neutral-500">
                                目前：{order.shippingCompany || "未填物流公司"} {order.trackingNo || "未填單號"}
                              </p>
                            )}
                            <Button
                              onClick={() => updateOrderTracking(order)}
                              className="mt-3 h-11 w-full rounded-2xl bg-neutral-900 text-sm"
                            >
                              更新物流並設為已出貨
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
                        <option value="male">男性</option>
                        <option value="female">女性</option>
                        <option value="unisex">中性</option>
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
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={createProduct} className="h-12 w-full rounded-2xl bg-neutral-900 text-base">
                      {editingProductId ? "更新商品" : "新增商品"}
                    </Button>
                    {editingProductId && (
                      <Button onClick={resetProductForm} className="h-12 w-full rounded-2xl bg-neutral-200 text-neutral-900 text-base">
                        取消編輯
                      </Button>
                    )}
                  </div>
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
                  onClick={() => refreshProductsFromXano({ useCache: false })}
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

                      <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => startEditProduct(product)} className="h-10 rounded-2xl bg-neutral-900 text-sm">
                          編輯
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
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${order.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{order.status}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${order.shippingStatus === "已出貨" ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-600"}`}>{order.shippingStatus}</span>
                      </div>
                    </div>
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
                    <div className="border-t pt-3 text-right font-black">{formatPrice(order.total)}</div>
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
                    <div className="flex flex-col items-end gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${selectedOrder.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {selectedOrder.status}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${selectedOrder.shippingStatus === "已出貨" ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-600"}`}>
                        {selectedOrder.shippingStatus}
                      </span>
                    </div>
                  </div>

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

                  <div className="rounded-3xl bg-neutral-50 p-4">
                    <h3 className="mb-3 font-black">出貨狀態</h3>
                    <p className="text-sm font-bold text-neutral-700">{selectedOrder.shippingStatus}</p>
                    {selectedOrder.shippingCompany && <p className="mt-1 text-sm text-neutral-500">物流公司：{selectedOrder.shippingCompany}</p>}
                    {selectedOrder.trackingNo && <p className="mt-1 text-sm text-neutral-500">追蹤碼：{selectedOrder.trackingNo}</p>}
                    </div>

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

        <nav className="sticky bottom-0 grid grid-cols-5 border-t bg-white px-2 py-2">
          <NavButton active={tab === "home"} icon={<Home size={20} />} label="首頁" onClick={() => setTab("home")} />
          <NavButton active={tab === "lookbook" || tab === "lookbook-detail" || tab === "outfit-builder"} icon={<Sparkles size={20} />} label="穿搭" onClick={() => setTab("lookbook")} />
          <NavButton active={tab === "shop"} icon={<Search size={20} />} label="商品" onClick={() => setTab("shop")} />
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

function ProductCard({ product, onClick }) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="overflow-hidden rounded-3xl border-neutral-100 shadow-sm transition hover:shadow-md">
        <img src={product.image} alt={product.name} className="h-40 w-full object-cover" />
        <CardContent className="p-3">
          <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-600">{product.tag}</span>
          <h3 className="mt-2 line-clamp-2 font-bold leading-tight">{product.name}</h3>
          <p className="mt-1 text-sm font-black">{formatPrice(product.price)}</p>
        </CardContent>
      </Card>
    </button>
  );
}

function OptionGroup({ title, options, value, setValue, disabledOptions = [], stockMap = {} }) {
  return (
    <section>
      <h3 className="mb-3 font-bold">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isDisabled = disabledOptions.includes(option);
          const stock = stockMap[option];

          return (
            <button
              key={option}
              disabled={isDisabled}
              onClick={() => !isDisabled && setValue(option)}
              className={`rounded-2xl border px-4 py-2 text-sm font-bold ${
                isDisabled
                  ? "cursor-not-allowed border-neutral-100 bg-neutral-100 text-neutral-300 line-through"
                  : value === option
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-700"
              }`}
            >
              {option}
              {typeof stock === "number" && stock > 0 && stock <= 3 && <span className="ml-1 text-[10px]">剩{stock}</span>}
            </button>
          );
        })}
      </div>
    </section>
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
