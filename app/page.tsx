// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect } from "react";
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

const XANO_CHECKOUT_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/checkout";
const XANO_ADD_ORDER_ITEM_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/add-order-item";
const XANO_GET_ORDERS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/Get_Orders";
const XANO_GET_ORDER_ITEMS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/order-items";
const XANO_PRODUCTS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/products";
const XANO_CREATE_ECPAY_ORDER_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/create-ecpay-order";
const XANO_CREATE_CVS_MAP_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/create-cvs-map";
const XANO_DECREASE_STOCK_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/decrease-stock";
const XANO_LOOKBOOKS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:pVi32Dp4/lookbooks";

export default function JGoAppPrototype() {
  const [tab, setTab] = useState("home");
  const [products, setProducts] = useState([]);
  const [lookbooks, setLookbooks] = useState([]);
  const [selectedLookbook, setSelectedLookbook] = useState(null);
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
  const [sizeAI, setSizeAI] = useState({ height: "", weight: "" });
  const isAdmin = currentUser?.email === "panzol034535@gmail.com";
  const touchStartX = React.useRef(null);
  const ordersLoadingRef = React.useRef(false);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart]);

  useEffect(() => {
    const savedUser = localStorage.getItem("jgo_current_user");
    if (savedUser) {
      const user = JSON.parse(savedUser);
      setCurrentUser(user);
      setAccountForm({ name: user.name, email: user.email, phone: user.phone });
      setCheckoutForm({ name: user.name, email: user.email, phone: user.phone });
    }
  }, []);

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
    if (!currentUser) return requireLogin();

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

  const recommendedSize = useMemo(() => {
    const height = Number(sizeAI.height);
    const weight = Number(sizeAI.weight);

    if (!height || !weight) return "";

    if (height < 165 && weight < 55) return "S";
    if (height < 175 && weight < 72) return "M";
    if (height < 183 && weight < 85) return "L";
    return "XL";
  }, [sizeAI]);

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

  const submitOrder = async () => {
    if (isSubmitting) return;
    if (!currentUser) return requireLogin();
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
            <button onClick={() => setTab("account")} className="rounded-full border border-neutral-200 p-3 text-neutral-700">
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
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-7">
              <section className="relative overflow-hidden rounded-[2.25rem] bg-neutral-950 text-white shadow-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.12),transparent_32%)]" />
                <div className="grid gap-5 p-6">
                  <div className="relative z-10 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-black tracking-[0.18em] text-neutral-200 backdrop-blur">
                        J-GO AI LOOKBOOK
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-neutral-900">BETA</span>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-bold text-neutral-300">日本選品 × AI 穿搭靈感</p>
                      <h2 className="text-[2.65rem] font-black leading-[0.95] tracking-tight">
                        一張圖，買完整套日系穿搭。
                      </h2>
                    </div>
                    <p className="max-w-xs text-sm leading-6 text-neutral-300">
                      用 AI Lookbook 找風格，點進去直接看襯衫、褲子、外套與配件。
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={() => setTab("lookbook")} className="h-11 rounded-2xl bg-white px-5 text-neutral-900 hover:bg-neutral-100">
                        探索穿搭
                      </Button>
                      <Button onClick={() => setTab("shop")} className="h-11 rounded-2xl bg-white/10 px-5 text-white hover:bg-white/20">
                        逛商品
                      </Button>
                    </div>
                  </div>

                  <div className="relative z-10 grid grid-cols-3 gap-2 rounded-[1.5rem] bg-white/10 p-2 backdrop-blur">
                    {[
                      { label: "LOOKS", value: lookbooks.length },
                      { label: "ITEMS", value: products.length },
                      { label: "STYLE", value: "JP" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl bg-white/10 p-3 text-center">
                        <p className="text-lg font-black">{item.value}</p>
                        <p className="text-[10px] font-black tracking-widest text-neutral-300">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-xs font-black tracking-widest text-neutral-400">SHOP BY STYLE</p>
                    <h3 className="text-xl font-black">選你的穿搭方向</h3>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "male", label: "MEN", sub: "男生日系", tone: "bg-neutral-900 text-white" },
                    { key: "female", label: "WOMEN", sub: "女生穿搭", tone: "bg-neutral-100 text-neutral-900" },
                    { key: "unisex", label: "UNISEX", sub: "中性寬鬆", tone: "bg-stone-100 text-neutral-900" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        setActiveGender(item.key);
                        setTab("lookbook");
                      }}
                      className={`rounded-[1.6rem] p-4 text-left shadow-sm transition active:scale-[0.98] ${item.tone}`}
                    >
                      <p className="text-lg font-black tracking-tight">{item.label}</p>
                      <p className="mt-1 text-[11px] font-bold opacity-70">{item.sub}</p>
                    </button>
                  ))}
                </div>
              </section>

              {lookbooks.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black tracking-widest text-neutral-400">STYLE FEED</p>
                      <h3 className="text-xl font-black">AI 穿搭靈感</h3>
                    </div>
                    <button onClick={() => setTab("lookbook")} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-black text-neutral-600">看全部</button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none]">
                    {lookbooks.slice(0, 5).map((lookbook, index) => (
                      <button
                        key={lookbook.id}
                        onClick={() => {
                          setSelectedLookbook(lookbook);
                          setTab("lookbook-detail");
                        }}
                        className="group min-w-[210px] overflow-hidden rounded-[2rem] bg-neutral-100 text-left shadow-sm transition active:scale-[0.99]"
                      >
                        <div className="relative">
                          <img src={lookbook.image} alt={lookbook.title} className="h-72 w-full object-cover transition duration-500 group-hover:scale-105" />
                          <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black text-neutral-700 backdrop-blur">
                            #{String(index + 1).padStart(2, "0")}
                          </div>
                        </div>
                        <div className="space-y-2 p-3">
                          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-neutral-600">{lookbook.tag}</span>
                          <p className="line-clamp-2 font-black leading-tight">{lookbook.title}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black tracking-widest text-neutral-400">SHOP THE LOOK</p>
                    <h3 className="text-xl font-black">本週推薦商品</h3>
                  </div>
                  <button onClick={() => setTab("shop")} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-black text-neutral-600">看全部</button>
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
                  <p className="text-sm font-bold text-neutral-400">AI STYLE INSPIRATION</p>
                  <h2 className="text-2xl font-black">AI LOOKBOOK</h2>
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
                <div className="space-y-5">
                  {lookbooks
                  .filter((lookbook) => activeGender === "all" || lookbook.gender === activeGender || (activeGender !== "all" && lookbook.gender === "unisex"))
                  .map((lookbook) => {
                    const relatedProducts = products.filter((product) => lookbook.product_ids.includes(Number(product.id)));

                    return (
                      <Card key={lookbook.id} className="overflow-hidden rounded-[2rem] border-neutral-100 shadow-sm">
                        <button
                          onClick={() => {
                            setSelectedLookbook(lookbook);
                            setTab("lookbook-detail");
                          }}
                          className="block w-full text-left"
                        >
                          <img src={lookbook.image} alt={lookbook.title} className="h-[520px] w-full object-cover" />
                          <CardContent className="space-y-3 p-4">
                            <div>
                              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">{lookbook.tag}</span>
                              <h3 className="mt-3 text-xl font-black">{lookbook.title}</h3>
                            </div>
                            {relatedProducts.length > 0 && (
                              <div className="flex gap-2 overflow-x-auto pb-1">
                                {relatedProducts.map((product) => (
                                  <div key={product.id} className="flex min-w-[150px] items-center gap-2 rounded-2xl bg-neutral-50 p-2">
                                    <img src={product.image} alt={product.name} className="h-12 w-12 rounded-xl object-cover" />
                                    <div>
                                      <p className="line-clamp-1 text-xs font-bold">{product.name}</p>
                                      <p className="text-xs font-black">{formatPrice(product.price)}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </button>
                      </Card>
                    );
                  })}
                </div>
              )}
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

              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((product) => <ProductCard key={product.id} product={product} onClick={() => openProduct(product)} />)}
              </div>
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
              <Card className="rounded-3xl border-neutral-100 bg-neutral-50 shadow-sm">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-neutral-500" />
                    <h3 className="font-black">AI 智能尺寸推薦</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
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
                    <div className="rounded-2xl bg-neutral-900 p-4 text-white">
                      <p className="text-xs font-bold text-neutral-300">AI 推薦尺寸</p>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-3xl font-black">{recommendedSize}</p>
                        <button
                          onClick={() => setSelectedSize(recommendedSize)}
                          className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-neutral-900"
                        >
                          使用推薦尺寸
                        </button>
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
                    if (!currentUser) return requireLogin();
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
                        {currentUser.name.slice(0, 1)}
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

                    <Button onClick={logout} className="h-12 w-full rounded-2xl bg-neutral-900 text-base">
                      <LogOut size={18} className="mr-2" /> 登出
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="rounded-3xl border-neutral-100 shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-1">
                      <button onClick={() => setAuthMode("login")} className={`rounded-xl py-2 text-sm font-bold ${authMode === "login" ? "bg-white shadow-sm" : "text-neutral-500"}`}>登入</button>
                      <button onClick={() => setAuthMode("register")} className={`rounded-xl py-2 text-sm font-bold ${authMode === "register" ? "bg-white shadow-sm" : "text-neutral-500"}`}>註冊</button>
                    </div>

                    {authMode === "register" && (
                      <Input label="姓名" placeholder="你的名字" value={authForm.name} onChange={(value) => setAuthForm({ ...authForm, name: value })} />
                    )}
                    <Input label="Email" placeholder="hello@example.com" value={authForm.email} onChange={(value) => setAuthForm({ ...authForm, email: value })} icon={<Mail size={18} />} />
                    <Input label="手機號碼" placeholder="0912345678" value={authForm.phone} onChange={(value) => setAuthForm({ ...authForm, phone: value })} />
                    <Input label="密碼" placeholder="至少 8 碼" type="password" value={authForm.password} onChange={(value) => setAuthForm({ ...authForm, password: value })} icon={<Lock size={18} />} />

                    <Button onClick={submitAuth} className="h-12 w-full rounded-2xl bg-neutral-900 text-base">
                      {authMode === "login" ? "登入" : "建立帳號"}
                    </Button>

                    <div className="flex items-center gap-3 text-xs text-neutral-400">
                      <div className="h-px flex-1 bg-neutral-200" />
                      或
                      <div className="h-px flex-1 bg-neutral-200" />
                    </div>

                    <button onClick={loginWithGoogle} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white font-bold text-neutral-900">
                      <span className="text-lg">G</span> 使用 Google 登入
                    </button>
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

              <Button
                onClick={() => refreshProductsFromXano({ useCache: false })}
                className="h-12 w-full rounded-2xl bg-neutral-900 text-base"
              >
                重新同步 Xano 商品
              </Button>

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
              {orders.length === 0 ? (
                <EmptyState title="目前沒有訂單" text="完成結帳後，訂單會出現在這裡。" action={() => setTab("shop")} />
              ) : orders.map((order) => (
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
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700">{order.status}</span>
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
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${selectedOrder.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {selectedOrder.status}
                    </span>
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
          <NavButton active={tab === "lookbook" || tab === "lookbook-detail"} icon={<Sparkles size={20} />} label="穿搭" onClick={() => setTab("lookbook")} />
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
