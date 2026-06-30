import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../api/client";
import "./CashierPOS.css";
import {
  normalizeList,
  getAvailableStock,
  normProduct,
  formatCurrency,
} from "../../utils/apiNormalize";
import { showError } from "../../utils/alert.jsx";
import PaymentApprovals from "./components/PaymentApprovals";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaw, faRotateRight, faTrash, faBoxOpen,
  faShoppingCart, faCreditCard, faMoneyBillWave, faMobileScreen,
  faTag, faReceipt, faTriangleExclamation, faPlus,
  faMinus, faXmark, faPrint, faClock, faBox, faCheckCircle,
  faBarcode, faKeyboard,
  faBolt, faUser, faList,
  faStore, faHistory, faBan, faCalculator, faExpand, faCompress,
  faBars, faChartLine, faUserCircle, faClipboardList, faWallet,
  faBone, faScissors, faBasketball, faPills, faBriefcaseMedical,
} from "@fortawesome/free-solid-svg-icons";

/* ---------- Constants -------------------------------------------- */
const PRODUCT_ENDPOINT  = "/cashier/inventory/sellable";
const SERVICE_ENDPOINT  = "/cashier/pos/services";
const CHECKOUT_ENDPOINT = "/cashier/pos/transaction";
const TAX_RATE = 0.12;

const PAYMENT_METHODS = [
  { value: "Cash",  label: "Cash",  icon: faMoneyBillWave, color: "#10B981" },
  { value: "GCash", label: "GCash", icon: faMobileScreen,  color: "#4F46E5" },
  { value: "Maya",  label: "Maya",  icon: faWallet,        color: "#00A4E0" },
];

const CATEGORY_CONFIG = {
  all:         { label: "All Products",  icon: faStore,            color: "#4F46E5", bg: "#EEF2FF" },
  food:        { label: "Pet Food",      icon: faPaw,              color: "#F97316", bg: "#FFF7ED" },
  accessories: { label: "Accessories",   icon: faBone,             color: "#8B5CF6", bg: "#F5F3FF" },
  grooming:    { label: "Grooming",      icon: faScissors,         color: "#EC4899", bg: "#FDF2F8" },
  toys:        { label: "Toys",          icon: faBasketball,       color: "#14B8A6", bg: "#ECFDF5" },
  health:      { label: "Health & Meds", icon: faPills,            color: "#EF4444", bg: "#FEF2F2" },
  services:    { label: "Services",      icon: faBriefcaseMedical, color: "#64748B", bg: "#F1F5F9" },
};

const QUICK_AMOUNTS = [20, 50, 100, 200, 500, 1000];

/* ---------- Helpers ---------------------------------------------- */
const fmt = (amount) => formatCurrency(amount, { minimumFractionDigits: 0 });

const discountedPrice = (p) => {
  const price = Number(p.price) || 0;
  const disc  = Number(p.discount) || 0;
  return disc > 0 ? price * (1 - disc / 100) : price;
};

const stockStatus = (stock) => {
  const q = getAvailableStock({ available_stock: stock });
  if (q <= 0) return { label: "Out of Stock", type: "out" };
  if (q <= 5) return { label: `Only ${q} left`, type: "low" };
  return { label: `${q} in stock`, type: "ok" };
};

const isProductOutOfStock = (product) => getAvailableStock(product) <= 0;

/* ---------- Main Component --------------------------------------- */
const CashierPOS = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  /* State */
  const [products, setProducts]           = useState([]);
  const [services, setServices]           = useState([]);
  const [cart, setCart]                   = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeTab, setActiveTab] = useState("products");
  const [pendingCount, setPendingCount] = useState(0);
  const [searchQuery, setSearchQuery]     = useState("");
  const [orderType, setOrderType]         = useState("walk-in");
  const [customers, setCustomers]         = useState([]);
  const [customerId, setCustomerId]       = useState(null);
  const [customerName, setCustomerName]   = useState("");
  const [voucher, setVoucher]             = useState("");
  const [validatedVoucher, setValidatedVoucher] = useState(null);
  const [voucherMessage, setVoucherMessage] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [showPaymentSection, setShowPaymentSection] = useState(false);
  const [loading, setLoading]             = useState(true);
  const [isRefreshingProducts, setIsRefreshingProducts] = useState(false);
  const [lastStockSyncAt, setLastStockSyncAt] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError]                 = useState("");
  const [completedReceipt, setCompletedReceipt] = useState(null);
  const [recentSale, setRecentSale]       = useState(null);
  const [toasts, setToasts]               = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [viewPhotoUrl, setViewPhotoUrl] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  const searchRef = useRef(null);
  const navMenuRef = useRef(null);
  const latestInventoryRequestRef = useRef(0);
  const productsRef = useRef([]);

  /* Toast */
  const addToast = useCallback((message, type = "info") => {
    const id = Date.now();
    setToasts(prev => {
      const next = [...prev, { id, message, type, createdAt: Date.now() }];
      return next.slice(-3);
    });
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  /* Fullscreen toggle */
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      const navbar = document.querySelector('.navbar, .sidebar, nav, aside');
      const sidebar = document.querySelector('.sidebar, aside, .sidebar-wrapper, .main-sidebar');
      if (navbar) navbar.style.display = 'none';
      if (sidebar) sidebar.style.display = 'none';
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
        addToast("Entered fullscreen mode", "success");
      }).catch(() => {
        if (navbar) navbar.style.display = '';
        if (sidebar) sidebar.style.display = '';
        addToast("Could not enter fullscreen mode", "error");
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
        setTimeout(() => {
          const navbar = document.querySelector('.navbar, .sidebar, nav, aside');
          const sidebar = document.querySelector('.sidebar, aside, .sidebar-wrapper, .main-sidebar');
          if (navbar) navbar.style.display = '';
          if (sidebar) sidebar.style.display = '';
        }, 100);
        addToast("Exited fullscreen mode", "info");
      }).catch(() => {
        addToast("Could not exit fullscreen mode", "error");
      });
    }
  }, [addToast]);

  const reconcileCartWithProducts = useCallback((freshProducts) => {
    const stockById = new Map(freshProducts.map((product) => [product.id, getAvailableStock(product)]));
    setCart((prevCart) => prevCart
      .map((item) => {
        const latestStock = stockById.get(item.id);
        if (latestStock === undefined) return item;
        if (latestStock <= 0) {
          addToast(`${item.name} removed from cart - out of stock`, "warn");
          return null;
        }
        if (item.quantity > latestStock) {
          addToast(`${item.name} quantity adjusted to available stock`, "warn");
          return { ...item, stock: latestStock, available_stock: latestStock, quantity: latestStock };
        }
        return { ...item, stock: latestStock, available_stock: latestStock };
      })
      .filter(Boolean));
  }, [addToast]);

  const fetchProducts = useCallback(async ({ silent = false } = {}) => {
    const requestId = latestInventoryRequestRef.current + 1;
    latestInventoryRequestRef.current = requestId;
    try {
      if (productsRef.current.length === 0 && !silent) {
        setLoading(true);
      } else {
        setIsRefreshingProducts(true);
      }
      const response = await apiRequest(PRODUCT_ENDPOINT);
      if (latestInventoryRequestRef.current !== requestId) return;
      const raw = normalizeList(response, ["products", "items", "data", "inventory", "sellable_items"]);
      const normalized = raw.map((p, i) => normProduct(p, i));
      setProducts(normalized);
      reconcileCartWithProducts(normalized);
      setLastStockSyncAt(new Date());
      setError("");
    } catch (err) {
      if (latestInventoryRequestRef.current === requestId) {
        const message = err.message || "Unable to refresh stock";
        if (productsRef.current.length === 0) {
          setError(message);
          showError(message);
        } else {
          addToast("Unable to refresh stock. Keeping previous product list.", "warn");
        }
      }
    } finally {
      if (latestInventoryRequestRef.current === requestId) {
        setLoading(false);
        setIsRefreshingProducts(false);
      }
    }
  }, [addToast, reconcileCartWithProducts]);

  const fetchServices = useCallback(async () => {
    try {
      const res = await apiRequest(SERVICE_ENDPOINT);
      const raw = normalizeList(res, ["services", "data"]);
      setServices(raw);
    } catch {
      setServices([]);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await apiRequest("/cashier/customers");
      const raw = normalizeList(res, ["customers", "data"]);
      setCustomers(raw);
    } catch {
      setCustomers([]);
    }
  }, []);

  useEffect(() => { fetchProducts(); fetchServices(); fetchCustomers(); }, [fetchProducts, fetchServices, fetchCustomers]);

  const fetchPendingCount = useCallback(async () => {
    try {
      const data = await apiRequest("/cashier/payment-requests");
      const list = data?.data || data?.requests || data?.payments || data || [];
      const pending = list.filter(r => {
        const ps = (r.payment_status || "pending").toLowerCase();
        return ps === "pending" || ps === "unpaid";
      });
      setPendingCount(pending.length);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => { fetchPendingCount(); }, [fetchPendingCount]);
  useEffect(() => {
    const interval = setInterval(() => fetchPendingCount(), 30000);
    return () => clearInterval(interval);
  }, [fetchPendingCount]);

  useEffect(() => {
    const interval = setInterval(() => { fetchServices(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchServices]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreenNow = !!document.fullscreenElement;
      setIsFullscreen(isFullscreenNow);
      if (!isFullscreenNow) {
        setTimeout(() => {
          const navbar = document.querySelector('.navbar, .sidebar, nav, aside');
          const sidebar = document.querySelector('.sidebar, aside, .sidebar-wrapper, .main-sidebar');
          if (navbar) navbar.style.display = '';
          if (sidebar) sidebar.style.display = '';
        }, 100);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target)) {
        setShowNavMenu(false);
      }
    };
    if (showNavMenu) { document.addEventListener('mousedown', handleClickOutside); }
    return () => { document.removeEventListener('mousedown', handleClickOutside); };
  }, [showNavMenu]);

  const allItems = useMemo(() => [
    ...products,
    ...services.map(s => ({ ...s, id: `svc-${s.id}`, _serviceId: s.id })),
  ], [products, services]);

  const categories = useMemo(() => {
    const grouped = allItems.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {});
    const catList = [
      { id: "all", label: CATEGORY_CONFIG.all.label, count: allItems.length, config: CATEGORY_CONFIG.all },
      ...Object.entries(grouped).map(([id, count]) => ({
        id,
        label: CATEGORY_CONFIG[id]?.label || id.replace(/\b\w/g, c => c.toUpperCase()),
        count,
        config: CATEGORY_CONFIG[id] || { icon: faBox, color: "#64748B", bg: "#F1F5F9" },
      })),
    ];
    return catList.sort((a, b) => {
      if (a.id === "all") return -1;
      if (b.id === "all") return 1;
      return b.count - a.count;
    });
  }, [allItems]);

  const filteredProducts = useMemo(() => {
    const kw = searchQuery.trim().toLowerCase();
    return allItems.filter(p => {
      const matchCat = activeCategory === "all" || p.category === activeCategory;
      const matchSearch = !kw
        || p.name.toLowerCase().includes(kw)
        || (p.service_category || p.category || "").toLowerCase().includes(kw)
        || String(p.barcode || "").toLowerCase().includes(kw);
      return matchCat && matchSearch;
    });
  }, [allItems, activeCategory, searchQuery]);

  const lowStockCount  = useMemo(() => products.filter(p => getAvailableStock(p) > 0 && getAvailableStock(p) <= 5).length, [products]);
  const outOfStockCount = useMemo(() => products.filter(p => isProductOutOfStock(p)).length, [products]);

  /* Cart operations */
  const addToCart = useCallback((product) => {
    const isService = product.item_type === "service";
    const availableStock = isService ? 9999 : getAvailableStock(product);
    if (!isService && availableStock <= 0) { addToast(`${product.name} is out of stock`, "warn"); return; }
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        if (existing.quantity >= availableStock) { addToast("Maximum stock reached", "warn"); return prev; }
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }, [addToast]);

  const updateQty = useCallback((id, qty) => {
    const n = Number(qty) || 0;
    if (n <= 0) { setCart(prev => prev.filter(i => i.id !== id)); return; }
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i;
      const availableStock = getAvailableStock(i);
      return { ...i, quantity: Math.min(n, availableStock || n) };
    }));
  }, []);

  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(i => i.id !== id));
  }, []);

  const clearOrder = useCallback(() => {
    setCart([]);
    setCustomerId(null);
    setCustomerName("");
    setVoucher("");
    setValidatedVoucher(null);
    setVoucherMessage("");
    setPaymentMethod("Cash");
    setAmountReceived("");
    setReferenceNumber("");
    setShowPaymentSection(false);
    setOrderType("walk-in");
  }, []);

  /* Totals */
  const subtotal = useMemo(() =>
    cart.reduce((sum, i) => sum + discountedPrice(i) * i.quantity, 0), [cart]);
  const tax = useMemo(() => subtotal * TAX_RATE / (1 + TAX_RATE), [subtotal]);
  const discountAmt = useMemo(() => {
    if (!validatedVoucher) return 0;
    const { type, value } = validatedVoucher;
    if (type === "percentage") return subtotal * (value / 100);
    if (type === "fixed") return Math.min(value, subtotal);
    return 0;
  }, [validatedVoucher, subtotal]);
  const total = useMemo(() => Math.max(subtotal - discountAmt, 0), [subtotal, discountAmt]);
  const change = useMemo(() => Math.max((Number(amountReceived) || 0) - total, 0), [amountReceived, total]);

  const canCheckout = cart.length > 0
    && cart.every((item) => item.quantity <= getAvailableStock(item))
    && !checkoutLoading
    && (paymentMethod !== "Cash" || (Number(amountReceived) || 0) >= total)
    && (paymentMethod === "Cash" || referenceNumber.trim() !== "");

  const handleSearchEnter = useCallback(() => {
    const kw = searchQuery.trim().toLowerCase();
    if (!kw) return;
    const barMatch = products.find(p => String(p.barcode || "").toLowerCase() === kw);
    if (barMatch) {
      addToCart(barMatch);
      setSearchQuery("");
      addToast(`${barMatch.name} added to cart`, "success");
      return;
    }
    if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0]);
      setSearchQuery("");
      addToast(`${filteredProducts[0].name} added to cart`, "success");
    }
  }, [searchQuery, products, filteredProducts, addToCart, addToast]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "F1") { e.preventDefault(); setShowHelp(true); }
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F3") { e.preventDefault(); if (cart.length > 0) clearOrder(); }
      if (e.key === "F4") { e.preventDefault(); if (cart.length > 0) setShowPaymentSection(true); }
      if (e.key === "Escape") {
        if (searchQuery) { setSearchQuery(""); return; }
        if (showPaymentSection) { setShowPaymentSection(false); return; }
        if (completedReceipt) { setCompletedReceipt(null); return; }
      }
      if (e.key === "Enter" && e.target === searchRef.current) {
        e.preventDefault();
        handleSearchEnter();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cart.length, searchQuery, showPaymentSection, completedReceipt, handleSearchEnter, clearOrder]);

  const handleValidateVoucher = async () => {
    const code = voucher.trim();
    if (!code) { setVoucherMessage("Please enter a voucher code."); return; }
    setValidatedVoucher(null);
    setVoucherMessage("Voucher validation is not available yet.");
  };

  const handleCheckout = async () => {
    if (!canCheckout) return;
    try {
      setCheckoutLoading(true);
      const payload = {
        order_type: orderType,
        customer_id: customerId || null,
        customer_name: customerName || "Walk-in Customer",
        payment_method: paymentMethod.toLowerCase(),
        cash_received: Number(amountReceived) || total,
        subtotal, tax, discount: discountAmt, total,
        voucher: validatedVoucher?.code || null,
        reference_number: (paymentMethod === "GCash" || paymentMethod === "Maya") ? referenceNumber : null,
        items: cart.map(i => {
          const isService = i.item_type === "service";
          return {
            item_type: isService ? "service" : "product",
            item_id: isService ? undefined : i.id,
            service_id: isService ? i._serviceId : undefined,
            item_name: i.name,
            quantity: i.quantity,
            unit_price: Number(i.price) || 0,
            discount_amount: Number(i.discount) || 0,
          };
        }),
      };
      const res = await apiRequest(CHECKOUT_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const txId = res?.transaction?.transaction_number
        || res?.transaction?.id
        || res?.transaction_id
        || res?.id
        || `TRX-${Date.now()}`;
      const receipt = {
        transaction_id: String(txId).startsWith("TRX-") ? String(txId) : `TRX-${String(txId).padStart(4, "0")}`,
        customer_name: payload.customer_name,
        payment_method: paymentMethod,
        amount_received: Number(amountReceived) || total,
        subtotal, tax, discount: discountAmt, total,
        change: Math.max((Number(amountReceived) || total) - total, 0),
        items: payload.items,
        reference_number: (paymentMethod === "GCash" || paymentMethod === "Maya") ? referenceNumber : null,
        date: new Date().toLocaleString("en-PH", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      };
      setRecentSale(receipt);
      addToast("Payment successful! Click View Receipt to print.", "success");
      clearOrder();
      fetchProducts({ silent: true });
      fetchServices();
    } catch (err) {
      addToast(err.message || "Checkout failed. Please try again.", "error");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePrint = (receiptOverride = null) => {
    const receiptToPrint = (receiptOverride && Array.isArray(receiptOverride.items)) ? receiptOverride : completedReceipt;
    if (!receiptToPrint || !Array.isArray(receiptToPrint.items)) return;
    const w = window.open("", "_blank", "width=420,height=700");
    if (!w) { addToast("Allow pop-ups to print receipt", "warn"); return; }
    const itemsHtml = receiptToPrint.items.map(i => {
      const itemTotal = (i.unit_price || 0) * i.quantity;
      return `<tr><td>${i.item_name} x ${i.quantity}<br><small>${fmt(i.unit_price)} each</small></td><td style="text-align:right">${fmt(itemTotal)}</td></tr>`;
    }).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
      <style>
        body{font-family:'Courier New',monospace;padding:20px;max-width:360px;margin:auto}
        h2{text-align:center;font-size:18px;margin-bottom:4px}
        .center{text-align:center;font-size:12px;color:#666;margin-bottom:12px}
        hr{border:none;border-top:1px dashed #ccc;margin:10px 0}
        table{width:100%;font-size:12px;border-collapse:collapse}
        td{padding:3px 0;vertical-align:top}
        .meta td{color:#444}.total-row td{font-size:14px;font-weight:bold;padding-top:8px;border-top:1px dashed #ccc}
        .footer{text-align:center;font-size:11px;color:#888;margin-top:12px}
        @media print{button{display:none}}
      </style></head><body>
      <h2>Pawesome Retreat Inc.</h2>
      <div class="center">Official Cashier Receipt<br>${receiptToPrint.date}</div>
      <hr>
      <table class="meta">
        <tr><td>Receipt</td><td style="text-align:right">${receiptToPrint.receipt_number || receiptToPrint.transaction_id}</td></tr>
        <tr><td>Cashier</td><td style="text-align:right">${receiptToPrint.cashier_name || user?.name || "Cashier"}</td></tr>
        <tr><td>Customer</td><td style="text-align:right">${receiptToPrint.customer_name}</td></tr>
        <tr><td>Payment</td><td style="text-align:right">${receiptToPrint.payment_method}</td></tr>
        <tr><td>Status</td><td style="text-align:right">${receiptToPrint.payment_status || "paid"}</td></tr>
      </table>
      <hr>
      <table>${itemsHtml}</table>
      <hr>
      <table>
        <tr><td>Subtotal (incl. VAT)</td><td style="text-align:right">${fmt(receiptToPrint.subtotal)}</td></tr>
        <tr><td>VAT 12%</td><td style="text-align:right">${fmt(receiptToPrint.tax)}</td></tr>
        <tr><td>Discount</td><td style="text-align:right">-${fmt(receiptToPrint.discount)}</td></tr>
        <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${fmt(receiptToPrint.total)}</td></tr>
        <tr><td>Received</td><td style="text-align:right">${fmt(receiptToPrint.amount_received)}</td></tr>
        <tr><td>Change</td><td style="text-align:right">${fmt(receiptToPrint.change)}</td></tr>
      </table>
      <div class="footer">Thank you for shopping with us!<br>Please keep this receipt.</div>
      <br><button onclick="window.print()">Print</button>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  /* ---- Render ---------------------------------------------------- */
  return (
    <>
      <div className="pos-page">
        {/* Top Bar */}
        <header className="pos-topbar">
          <div className="pos-topbar-brand">
            <div className="pos-brand-mark"><FontAwesomeIcon icon={faPaw} /></div>
            Cashier POS
          </div>

          <div className="pos-topbar-center">
            <div className="pos-search-bar">
              <FontAwesomeIcon icon={faBarcode} />
              <input
                ref={searchRef}
                className="pos-search-input"
                type="text"
                placeholder="Search product name or scan barcode… (Enter to add)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSearchEnter(); } }}
              />
              {searchQuery && (
                <FontAwesomeIcon icon={faXmark} style={{ cursor: "pointer", color: "var(--color-muted)" }}
                  onClick={() => setSearchQuery("")} />
              )}
            </div>
          </div>

          <div className="pos-shortcut-pills">
            <span className="pos-pill"><kbd>F1</kbd> Help</span>
            <span className="pos-pill"><kbd>F2</kbd> Search</span>
            <span className="pos-pill"><kbd>F3</kbd> Clear</span>
            <span className="pos-pill"><kbd>F4</kbd> Pay</span>
            <span className="pos-pill"><kbd>Esc</kbd> Cancel</span>
          </div>

          <div className="pos-topbar-right">
            <div className="pos-nav-menu-container" ref={navMenuRef}>
              <button className="pos-icon-btn" onClick={() => setShowNavMenu(!showNavMenu)}>
                <FontAwesomeIcon icon={faBars} /> Menu
              </button>
              {showNavMenu && (
                <div className="pos-nav-menu-dropdown">
                  <div className="pos-nav-menu-header">Navigate To</div>
                  <button className="pos-nav-menu-item" onClick={() => { navigate('/cashier/dashboard'); setShowNavMenu(false); }}>
                    <FontAwesomeIcon icon={faChartLine} /> Dashboard
                  </button>
                  <button className="pos-nav-menu-item" onClick={() => { navigate('/cashier/transactions'); setShowNavMenu(false); }}>
                    <FontAwesomeIcon icon={faClipboardList} /> Transactions
                  </button>
                  <button className="pos-nav-menu-item" onClick={() => { navigate('/cashier/reports'); setShowNavMenu(false); }}>
                    <FontAwesomeIcon icon={faChartLine} /> Reports
                  </button>
                  <button className="pos-nav-menu-item" onClick={() => { navigate('/cashier/history'); setShowNavMenu(false); }}>
                    <FontAwesomeIcon icon={faHistory} /> History
                  </button>
                  <button className="pos-nav-menu-item" onClick={() => { navigate('/cashier/profile'); setShowNavMenu(false); }}>
                    <FontAwesomeIcon icon={faUserCircle} /> Profile
                  </button>
                </div>
              )}
            </div>

            {lowStockCount > 0 && (
              <span className="pos-stock-badge pos-stock-badge--low">
                <FontAwesomeIcon icon={faTriangleExclamation} /> {lowStockCount} Low
              </span>
            )}
            {outOfStockCount > 0 && (
              <span className="pos-stock-badge pos-stock-badge--out">
                <FontAwesomeIcon icon={faBan} /> {outOfStockCount} Out
              </span>
            )}

            <button className="pos-icon-btn" onClick={() => { fetchProducts(); fetchServices(); }}>
              <FontAwesomeIcon icon={faRotateRight} /> Refresh
            </button>

            <button className="pos-icon-btn pos-icon-btn--danger" onClick={clearOrder} disabled={cart.length === 0}>
              <FontAwesomeIcon icon={faTrash} /> Clear
            </button>

            <button className="pos-icon-btn" onClick={() => setShowHelp(true)} title="Keyboard shortcuts">
              <FontAwesomeIcon icon={faKeyboard} /> Help
            </button>

            <button className="pos-icon-btn pos-icon-btn--primary" onClick={toggleFullscreen}>
              <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} />
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="pos-body">
          {/* Left: Categories */}
          <aside className="pos-categories-pane">
            <div className="pos-pane-header">
              <div className="pos-pane-label">Browse By</div>
              <div className="pos-pane-title">Categories</div>
            </div>
            <div className="pos-category-list">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  className={`pos-category-btn${activeTab === "products" && activeCategory === cat.id ? " active" : ""}`}
                  style={{ "--cat-color": cat.config?.color, "--cat-bg": cat.config?.bg }}
                  onClick={() => { setActiveTab("products"); setActiveCategory(cat.id); }}
                >
                  <span className="cat-icon"><FontAwesomeIcon icon={cat.config?.icon || faBox} /></span>
                  <span className="cat-label">{cat.label}</span>
                  <span className="cat-count">{cat.count}</span>
                </button>
              ))}
              <div className="pos-category-divider" />
              <button
                key="payment-approvals"
                className={`pos-category-btn${activeTab === "payment-approvals" ? " active" : ""}`}
                style={{ "--cat-color": "#10b981", "--cat-bg": "#ECFDF5" }}
                onClick={() => setActiveTab("payment-approvals")}
              >
                <span className="cat-icon"><FontAwesomeIcon icon={faCheckCircle} /></span>
                <span className="cat-label">Payment Approvals</span>
                <span className="cat-count" style={{ background: "#10b981", color: "#fff" }}>{pendingCount}</span>
              </button>
            </div>
          </aside>

          {/* Center: Products or Payment Approvals */}
          <main className="pos-products-pane">
            {activeTab === "payment-approvals" ? (
              <PaymentApprovals />
            ) : (
              <>
                <div className="pos-products-pane-header">
                  <div>
                    <div className="pos-pane-label">Catalog</div>
                    <div className="pos-section-title">
                      {activeCategory === "all" ? "All Products"
                        : categories.find(c => c.id === activeCategory)?.label || "Products"}
                    </div>
                  </div>
                  <span
                    className="pos-count-pill"
                    title={lastStockSyncAt ? `Last synced ${lastStockSyncAt.toLocaleTimeString()}` : "Stock not synced yet"}
                  >
                    <FontAwesomeIcon icon={faList} />
                    {isRefreshingProducts
                      ? "Refreshing stock..."
                      : `${filteredProducts.length} item${filteredProducts.length !== 1 ? "s" : ""}`}
                  </span>
                </div>

                {loading ? (
                  <div className="pos-state-card">
                    <div className="pos-spinner" />
                    <div className="pos-state-title">Loading products…</div>
                    <div className="pos-state-text">Fetching inventory from the server.</div>
                  </div>
                ) : error ? (
                  <div className="pos-state-card">
                    <div className="pos-state-icon"><FontAwesomeIcon icon={faTriangleExclamation} /></div>
                    <div className="pos-state-title">Could not load products</div>
                    <div className="pos-state-text">{error}</div>
                    <button className="pos-icon-btn" onClick={fetchProducts}><FontAwesomeIcon icon={faRotateRight} /> Retry</button>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="pos-state-card">
                    <div className="pos-state-icon"><FontAwesomeIcon icon={faBoxOpen} /></div>
                    <div className="pos-state-title">No products found</div>
                    <div className="pos-state-text">Try another category or search term.</div>
                  </div>
                ) : (
                  <div className="pos-product-grid">
                    {filteredProducts.map(product => {
                      const cartItem    = cart.find(i => i.id === product.id);
                      const dPrice      = discountedPrice(product);
                      const hasDisc     = Number(product.discount) > 0;
                      const availStock  = getAvailableStock(product);
                      const outOfStock  = availStock <= 0;
                      const ss          = stockStatus(availStock);
                      return (
                        <article
                          key={product.id}
                          className={`pos-product-card${cartItem ? " in-cart" : ""}${outOfStock ? " out-of-stock" : ""}`}
                        >
                          <div className="pos-product-thumb">
                            {product.image
                              ? <img src={product.image} alt={product.name} onClick={(e) => { e.stopPropagation(); setViewPhotoUrl(product.image); }} />
                              : <FontAwesomeIcon icon={faBoxOpen} />}
                            {hasDisc && <span className="pos-discount-chip">-{product.discount}%</span>}
                            {cartItem && <span className="pos-cart-qty-badge">{cartItem.quantity}</span>}
                          </div>
                          <div className="pos-product-body">
                            <div className="pos-product-name" title={product.name}>{product.name}</div>
                            <div className="pos-price-row">
                              <span className="pos-price-main">{fmt(dPrice)}</span>
                              {hasDisc && <span className="pos-price-old">{fmt(product.price)}</span>}
                            </div>
                            <span className={`pos-stock-status pos-stock-status--${ss.type}`}>{ss.label}</span>
                            <button
                              className={`pos-add-to-cart-btn${outOfStock ? " pos-add-to-cart-btn--disabled" : ""}`}
                              disabled={outOfStock}
                              onClick={() => addToCart(product)}
                            >
                              {outOfStock ? "Out of Stock" : "Add to Cart"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </main>

          {/* Right: Order Panel */}
          <aside className="pos-order-pane">
            <div className="pos-order-header">
              <div className="pos-pane-label">Current</div>
              <div className="pos-pane-title">Order Details</div>
            </div>

            <div className="pos-customer-field">
              <label className="pos-field-label">
                <FontAwesomeIcon icon={faUser} /> Customer
              </label>
              <select
                value={customerId || ""}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setCustomerId(id);
                  const c = customers.find((x) => x.id === id);
                  setCustomerName(c ? c.name : "");
                }}
              >
                <option value="">Walk-in Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</option>
                ))}
              </select>
              {!customerId && (
                <input
                  className="pos-field-input"
                  type="text"
                  placeholder="Type walk-in customer name..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              )}
            </div>

            {/* Cart */}
            <div className="pos-cart-list">
              {cart.length === 0 ? (
                <div className="pos-empty-cart">
                  <FontAwesomeIcon icon={faShoppingCart} className="pos-empty-cart-icon" />
                  <div>
                    <div className="pos-empty-cart-title">Cart is empty</div>
                    <div>Click a product or scan a barcode to add items.</div>
                  </div>
                </div>
              ) : (
                cart.map(item => (
                  <div className="pos-cart-item" key={item.id}>
                    <div className="pos-cart-item-info">
                      <div className="pos-cart-item-name" title={item.name}>{item.name}</div>
                      <div className="pos-cart-item-price">{fmt(discountedPrice(item))} each</div>
                    </div>
                    <div className="pos-qty-control">
                      <button className="pos-qty-btn" onClick={() => updateQty(item.id, item.quantity - 1)}>
                        <FontAwesomeIcon icon={faMinus} />
                      </button>
                      <input
                        className="pos-qty-input"
                        type="number"
                        min="1"
                        max={getAvailableStock(item)}
                        value={item.quantity}
                        onChange={e => updateQty(item.id, e.target.value)}
                      />
                      <button
                        className="pos-qty-btn"
                        onClick={() => updateQty(item.id, item.quantity + 1)}
                        disabled={item.quantity >= getAvailableStock(item)}
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </button>
                    </div>
                    <div className="pos-cart-item-total">{fmt(discountedPrice(item) * item.quantity)}</div>
                    <button className="pos-remove-btn" onClick={() => removeFromCart(item.id)}>
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Voucher */}
            <div className="pos-voucher-section">
              <label className="pos-field-label" style={{ marginBottom: 6 }}>
                <FontAwesomeIcon icon={faTag} /> Voucher Code
              </label>
              <div className="pos-voucher-row">
                <input
                  className="pos-voucher-input"
                  type="text"
                  placeholder="Enter voucher code"
                  value={voucher}
                  onChange={e => { setVoucher(e.target.value); setValidatedVoucher(null); setVoucherMessage(""); }}
                />
                <button
                  className="pos-voucher-btn"
                  onClick={handleValidateVoucher}
                  disabled={true}
                  title="Voucher validation is not available yet."
                >
                  Apply
                </button>
              </div>
              {voucherMessage && (
                <div className={`pos-voucher-msg${validatedVoucher ? " pos-voucher-msg--success" : ""}`}>
                  <FontAwesomeIcon icon={validatedVoucher ? faCheckCircle : faXmark} />
                  {voucherMessage}
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="pos-summary-section">
              <div className="pos-summary-row pos-summary-row--muted">
                <span>Subtotal (incl. VAT)</span><span>{fmt(subtotal)}</span>
              </div>
              <div className="pos-summary-row pos-summary-row--muted">
                <span>VAT 12%</span><span>{fmt(tax)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="pos-summary-row pos-summary-row--muted">
                  <span style={{ color: "#059669" }}>Discount {validatedVoucher ? `(${validatedVoucher.code})` : ""}</span>
                  <span style={{ color: "#059669" }}>-{fmt(discountAmt)}</span>
                </div>
              )}
              <div className="pos-summary-total">
                <div className="pos-total-label">Total</div>
                <div className="pos-total-amount">{fmt(total)}</div>
              </div>
              {showPaymentSection && paymentMethod === "Cash" && (Number(amountReceived) || 0) >= total && (
                <div className="pos-change-row" style={{ marginTop: 6 }}>
                  <div className="pos-change-label">Change</div>
                  <div className="pos-change-amount">{fmt(change)}</div>
                </div>
              )}
            </div>

            {/* Payment */}
            {showPaymentSection && (
              <div className="pos-payment-section">
                <label className="pos-field-label" style={{ marginBottom: 8 }}>
                  <FontAwesomeIcon icon={faCreditCard} /> Payment Method
                </label>
                <div className="pos-payment-method-grid">
                  {PAYMENT_METHODS.map(pm => (
                    <button
                      key={pm.value}
                      className={`pos-pay-method-btn${paymentMethod === pm.value ? " active" : ""}`}
                      style={{ "--pm-color": pm.color }}
                      onClick={() => setPaymentMethod(pm.value)}
                    >
                      <FontAwesomeIcon icon={pm.icon} />
                      {pm.label}
                    </button>
                  ))}
                </div>

                {paymentMethod === "Cash" && (
                  <>
                    <label className="pos-field-label" style={{ marginBottom: 6 }}>
                      <FontAwesomeIcon icon={faMoneyBillWave} /> Amount Received
                    </label>
                    <div className="pos-amount-row">
                      <input
                        className="pos-amount-input"
                        type="number"
                        min="0"
                        placeholder={total.toFixed(2)}
                        value={amountReceived}
                        onChange={e => setAmountReceived(e.target.value)}
                      />
                    </div>
                    <div className="pos-quick-amounts">
                      {QUICK_AMOUNTS.map(a => (
                        <button key={a} className="pos-quick-btn"
                          onClick={() => setAmountReceived(String((Number(amountReceived) || 0) + a))}>
                          +₱{a.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {(paymentMethod === "GCash" || paymentMethod === "Maya") && (
                  <>
                    <label className="pos-field-label" style={{ marginBottom: 6 }}>
                      <FontAwesomeIcon icon={faMobileScreen} /> Reference Number
                    </label>
                    <div className="pos-amount-row">
                      <input
                        className="pos-amount-input"
                        type="text"
                        placeholder="Enter reference number"
                        value={referenceNumber}
                        onChange={e => setReferenceNumber(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="pos-actions-bar">
              {!showPaymentSection ? (
                <button className="pos-checkout-btn" onClick={() => setShowPaymentSection(true)} disabled={cart.length === 0}>
                  <FontAwesomeIcon icon={faCalculator} />
                  Proceed to Payment — {fmt(total)}
                </button>
              ) : (
                <button className="pos-checkout-btn" onClick={handleCheckout} disabled={!canCheckout}>
                  <FontAwesomeIcon icon={checkoutLoading ? faClock : faCheckCircle} />
                  {checkoutLoading ? "Processing…" : `Complete Payment — ${fmt(total)}`}
                </button>
              )}

              <div className="pos-secondary-btns-row">
                <button
                  className="pos-sec-btn pos-sec-btn--danger"
                  onClick={clearOrder}
                  disabled={cart.length === 0}
                >
                  <FontAwesomeIcon icon={faTrash} /> Clear Cart
                </button>
              </div>

              {recentSale && (
                <div className="pos-recent-sale">
                  <div className="pos-recent-sale-row">
                    <div>
                      <div className="pos-recent-sale-label">Last Sale</div>
                      <div className="pos-recent-sale-id">{recentSale.transaction_id}</div>
                    </div>
                    <div className="pos-recent-sale-total">{fmt(recentSale.total)}</div>
                  </div>
                  <div className="pos-recent-sale-actions">
                    <button className="pos-sec-btn pos-sec-btn--success" style={{ flex: 1 }}
                      onClick={() => setCompletedReceipt(recentSale)}>
                      <FontAwesomeIcon icon={faReceipt} /> View Receipt
                    </button>
                    <button className="pos-sec-btn" style={{ flex: 1 }}
                      onClick={() => setRecentSale(null)}>
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Receipt Modal */}
      {completedReceipt && (
        <div className="pos-overlay" onClick={() => setCompletedReceipt(null)}>
          <div className="pos-modal" onClick={e => e.stopPropagation()}>
            <div className="pos-modal-header">
              <div>
                <div className="pos-modal-title">Receipt Preview</div>
                <div className="pos-modal-sub">{completedReceipt.transaction_id} · {completedReceipt.date}</div>
              </div>
              <button className="pos-remove-btn" style={{ width: 30, height: 30 }} onClick={() => setCompletedReceipt(null)}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className="pos-modal-body">
              <div className="pos-receipt-paper">
                <div className="pos-receipt-store">
                  <h3>Pawesome Retreat Inc.</h3>
                  <p>Official Cashier Receipt · {completedReceipt.date}</p>
                </div>
                <div className="pos-receipt-divider" />
                <div className="pos-receipt-row"><span>Transaction</span><span>{completedReceipt.transaction_id}</span></div>
                <div className="pos-receipt-row"><span>Customer</span><span>{completedReceipt.customer_name}</span></div>
                <div className="pos-receipt-row"><span>Payment</span><span>{completedReceipt.payment_method}</span></div>
                {completedReceipt.reference_number && (
                  <div className="pos-receipt-row"><span>Reference</span><span>{completedReceipt.reference_number}</span></div>
                )}
                <div className="pos-receipt-divider" />
                {completedReceipt.items.map((item, idx) => {
                  const unitPrice  = item.unit_price || 0;
                  const itemTotal  = unitPrice * item.quantity;
                  const itemVatAmt = unitPrice * (TAX_RATE / (1 + TAX_RATE)) * item.quantity;
                  return (
                    <div className="pos-receipt-item-row" key={idx}>
                      <div className="item-name">{item.item_name}</div>
                      <div className="item-meta">
                        <span>{item.quantity} × {fmt(unitPrice)} (VAT {fmt(itemVatAmt)})</span>
                        <span>{fmt(itemTotal)}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="pos-receipt-divider" />
                <div className="pos-receipt-row"><span>Subtotal (incl. VAT)</span><span>{fmt(completedReceipt.subtotal)}</span></div>
                <div className="pos-receipt-row"><span>VAT 12%</span><span>{fmt(completedReceipt.tax)}</span></div>
                <div className="pos-receipt-row"><span>Discount</span><span>-{fmt(completedReceipt.discount)}</span></div>
                <div className="pos-receipt-total"><span>TOTAL</span><span>{fmt(completedReceipt.total)}</span></div>
                <div className="pos-receipt-row"><span>Received</span><span>{fmt(completedReceipt.amount_received)}</span></div>
                <div className="pos-receipt-row pos-receipt-row--bold"><span>Change</span><span>{fmt(completedReceipt.change)}</span></div>
                <div className="pos-receipt-divider" />
                <div className="pos-receipt-footer">
                  Thank you for shopping with us!<br />
                  Please keep this receipt for reference.
                </div>
              </div>
            </div>
            <div className="pos-modal-footer">
              <button className="pos-sec-btn" style={{ flex: 1, height: 40 }} onClick={() => setCompletedReceipt(null)}>Close</button>
              <button className="pos-checkout-btn" style={{ flex: 2, height: 40, fontSize: 13 }} onClick={() => handlePrint()}>
                <FontAwesomeIcon icon={faPrint} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo View Modal */}
      {viewPhotoUrl && (
        <div className="pos-photo-modal-overlay" onClick={() => setViewPhotoUrl(null)}>
          <div className="pos-photo-modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="pos-photo-modal-close" onClick={() => setViewPhotoUrl(null)}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
            <img className="pos-photo-modal-img" src={viewPhotoUrl} alt="Product" />
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="pos-help-overlay" onClick={() => setShowHelp(false)}>
          <div className="pos-help-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="pos-help-title"><FontAwesomeIcon icon={faKeyboard} style={{ marginRight: 10 }} />Keyboard Shortcuts</h2>
            <div className="pos-help-grid">
              <div className="pos-help-row"><span>Open this help</span><kbd>F1</kbd></div>
              <div className="pos-help-row"><span>Focus search bar</span><kbd>F2</kbd></div>
              <div className="pos-help-row"><span>Clear cart / order</span><kbd>F3</kbd></div>
              <div className="pos-help-row"><span>Open payment section</span><kbd>F4</kbd></div>
              <div className="pos-help-row"><span>Cancel / close modal</span><kbd>Esc</kbd></div>
              <div className="pos-help-row"><span>Add scanned product</span><kbd>Enter</kbd></div>
            </div>
            <button className="pos-icon-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => setShowHelp(false)}>
              <FontAwesomeIcon icon={faXmark} /> Close
            </button>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="pos-toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`pos-toast-item pos-toast-item--${t.type}`}>
            <FontAwesomeIcon icon={
              t.type === "success" ? faCheckCircle :
              t.type === "error"   ? faXmark :
              t.type === "warn"    ? faTriangleExclamation :
              faBolt
            } />
            {t.message}
            <div className="pos-toast-progress" />
          </div>
        ))}
      </div>
    </>
  );
};

export default CashierPOS;
