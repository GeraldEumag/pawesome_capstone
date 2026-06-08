import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styled, { createGlobalStyle, keyframes, css } from "styled-components";
import { apiRequest } from "../../api/client";
import {
  normalizeList,
  getAvailableStock,
  normProduct,
  formatCurrency,
} from "../../utils/apiNormalize";
import { showError } from "../../utils/alert";
import PaymentApprovals from "./components/PaymentApprovals";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaw, faSearch, faRotateRight, faTrash, faBoxOpen,
  faShoppingCart, faCreditCard, faMoneyBillWave, faMobileScreen,
  faGlobe, faTag, faReceipt, faTriangleExclamation, faPlus,
  faMinus, faXmark, faPrint, faClock, faBox, faCheckCircle,
  faBarcode, faPercent, faKeyboard,
  faBolt, faUser, faChevronDown, faChevronUp, faList,
  faStore, faHistory, faBan, faCalculator, faExpand, faCompress,
  faBars, faChartLine, faUserCircle, faClipboardList, faWallet,
  faBone, faScissors, faBasketball, faPills, faBriefcaseMedical,
} from "@fortawesome/free-solid-svg-icons";

/* ─── Constants ────────────────────────────────────────────────── */
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
  all:          { label: "All Products",   icon: faStore,             color: "#4F46E5", bg: "#EEF2FF" },
  food:         { label: "Pet Food",       icon: faPaw,               color: "#F97316", bg: "#FFF7ED" },
  accessories:  { label: "Accessories",    icon: faBone,              color: "#8B5CF6", bg: "#F5F3FF" },
  grooming:     { label: "Grooming",       icon: faScissors,          color: "#EC4899", bg: "#FDF2F8" },
  toys:         { label: "Toys",           icon: faBasketball,        color: "#14B8A6", bg: "#ECFDF5" },
  health:       { label: "Health & Meds",  icon: faPills,              color: "#EF4444", bg: "#FEF2F2" },
  services:     { label: "Services",       icon: faBriefcaseMedical,  color: "#64748B", bg: "#F1F5F9" },
};

const QUICK_AMOUNTS = [20, 50, 100, 200, 500, 1000];

/* ─── Helpers ──────────────────────────────────────────────────── */
const fmt = (amount) => formatCurrency(amount, { minimumFractionDigits: 0 });

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

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

/* ─── Design Tokens ────────────────────────────────────────────── */
const PINK       = "#ff5f93";
const PINK_LIGHT = "#ff8db5";
const GLASS_BG   = "rgba(255,255,255,0.82)";
const GLASS_BDR  = "rgba(255,95,147,0.18)";
const GLASS_SHD  = "0 18px 45px rgba(255,95,147,0.14)";
const BLUR       = "backdrop-filter: blur(18px)";

/* ─── Global Styles ────────────────────────────────────────────── */
const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }

  :root,
  [data-theme="light"] {
    --pos-glass-bg:   rgba(255,255,255,0.82);
    --pos-glass-bdr:  rgba(255,95,147,0.18);
    --pos-glass-shd:  0 18px 45px rgba(255,95,147,0.14);
    --pos-text:       #1f2937;
    --pos-muted:      #64748b;
    --pos-surface:    rgba(255,255,255,0.62);
    --pos-input-bg:   rgba(255,255,255,0.8);
    --pos-heading:    #191919;
  }
`;

/* ─── Animations ───────────────────────────────────────────────── */
const fadeIn    = keyframes`from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}`;
const slideIn   = keyframes`from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}`;
const popIn     = keyframes`from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}`;
const spin      = keyframes`to{transform:rotate(360deg)}`;
const pulse     = keyframes`0%,100%{opacity:1}50%{opacity:.5}`;

/* ─── Styled Components ────────────────────────────────────────── */

/* Layout */
const POSPage = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
  color: var(--pos-text);
  overflow: hidden;

  @media (max-width: 768px) {
    height: auto;
    min-height: 100vh;
    overflow: visible;
  }
`;

/* Top Bar */
const TopBar = styled.header`
  height: 60px;
  background: var(--color-surface-solid);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 16px;
  flex-shrink: 0;
  z-index: 50;

  @media (max-width: 768px) {
    height: auto;
    min-height: 60px;
    align-items: stretch;
    flex-wrap: wrap;
    padding: 10px;
    gap: 10px;
  }
`;

const TopBarBrand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
  color: var(--pos-heading);
  letter-spacing: -0.3px;
`;

const BrandMark = styled.div`
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: linear-gradient(135deg, #E91E63, #C2185B);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  flex-shrink: 0;
`;

const TopBarCenter = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;

  @media (max-width: 768px) {
    order: 3;
    flex: 0 0 100%;
  }
`;

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  background: var(--pos-input-bg);
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  padding: 0 14px;
  width: 100%;
  max-width: 480px;
  transition: border-color 0.15s;
  &:focus-within { border-color: #E91E63; background: var(--color-surface-solid); }
  svg { color: #9CA3AF; font-size: 13px; flex-shrink: 0; }

  @media (max-width: 768px) {
    max-width: none;
  }
`;

const SearchInput = styled.input`
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--pos-text);
  outline: none;
  &::placeholder { color: #9CA3AF; }
`;

const ShortcutPills = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;

  @media (max-width: 768px) {
    display: none;
  }
`;

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--pos-surface);
  color: var(--pos-muted);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  kbd {
    background: #E5E7EB;
    border-radius: 3px;
    padding: 1px 4px;
    font-family: inherit;
    font-size: 10px;
    color: #374151;
  }
`;

const TopBarRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;

  @media (max-width: 768px) {
    margin-left: 0;
    flex: 1;
    justify-content: flex-end;
    min-width: 0;
  }
`;

const IconBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #E5E7EB;
  background: var(--color-surface-solid, #fff);
  color: #374151;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  &:hover { background: var(--color-surface-muted, #F9FAFB); border-color: #D1D5DB; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  ${({ $danger }) => $danger && css`
    border-color: #FCA5A5;
    color: #DC2626;
    &:hover { background: #FEF2F2; }
  `}
  ${({ $primary }) => $primary && css`
    background: #E91E63;
    border-color: #E91E63;
    color: #fff;
    &:hover { background: #C2185B; }
  `}
  ${({ $warning }) => $warning && css`
    border-color: #FCD34D;
    color: #D97706;
    background: #FFFBEB;
    &:hover { background: #FEF3C7; }
  `}

  @media (max-width: 768px) {
    width: 38px;
    padding: 0;
    justify-content: center;
    font-size: 0;

    svg {
      font-size: 14px;
    }
  }
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  background: ${({ $type }) =>
    $type === "low"  ? "#FEF3C7" :
    $type === "out"  ? "#FEE2E2" :
    $type === "info" ? "#EEF2FF" : "#F3F4F6"};
  color: ${({ $type }) =>
    $type === "low"  ? "#D97706" :
    $type === "out"  ? "#DC2626" :
    $type === "info" ? "#4F46E5" : "#6B7280"};
`;

/* Body */
const POSBody = styled.div`
  display: grid;
  grid-template-columns: 220px 1fr 360px;
  flex: 1;
  overflow: hidden;

  @media (max-width: 1024px) {
    grid-template-columns: 180px minmax(0, 1fr) 320px;
  }

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    flex: none;
    overflow: visible;
  }
`;

/* Left: Categories */
const CategoriesPane = styled.aside`
  background: var(--color-surface-solid);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @media (max-width: 768px) {
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
    overflow: visible;
  }
`;

const PaneHeader = styled.div`
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--color-border);
`;

const PaneLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: #9CA3AF;
  text-transform: uppercase;
  margin-bottom: 2px;
`;

const PaneTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: var(--pos-heading);
`;

const CategoryList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 4px; }

  @media (max-width: 768px) {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 8px 10px 12px;
  }
`;

const CategoryBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 8px;
  border: none;
  background: ${({ $active, $bg }) => $active ? $bg || "#FFF0F4" : "transparent"};
  color: ${({ $active, $color }) => $active ? $color || "#E91E63" : "#374151"};
  font-size: 13px;
  font-weight: ${({ $active }) => $active ? 700 : 500};
  cursor: pointer;
  text-align: left;
  transition: all 0.12s;
  &:hover { background: ${({ $active, $bg }) => $active ? $bg || "#FFF0F4" : "#F9FAFB"}; }
  .cat-icon { width: 28px; height: 28px; border-radius: 6px;
    background: ${({ $active, $color }) => $active ? ($color || "#E91E63") + "22" : "#F3F4F6"};
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; flex-shrink: 0; }
  .cat-icon svg { color: ${({ $active, $color }) => $active ? ($color || "#E91E63") : "#9CA3AF"}; }
  .cat-label { flex: 1; }
  .cat-count { font-size: 11px; font-weight: 700;
    background: ${({ $active, $color }) => $active ? ($color || "#E91E63") : "#E5E7EB"};
    color: ${({ $active }) => $active ? "#fff" : "#6B7280"};
    border-radius: 999px; padding: 1px 7px; }

  @media (max-width: 768px) {
    width: auto;
    min-width: 150px;
    flex: 0 0 auto;
  }
`;

/* Center: Products */
const ProductsPane = styled.main`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);

  @media (max-width: 768px) {
    min-height: 420px;
    overflow: visible;
  }
`;

const ProductsPaneHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: var(--color-surface-solid);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
`;

const SectionTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: var(--pos-heading);
`;

const CountPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--pos-surface);
  color: var(--pos-muted);
  font-size: 12px;
  font-weight: 600;
`;

const ProductGrid = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  align-content: start;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; }

  @media (max-width: 768px) {
    flex: none;
    overflow: visible;
    padding: 14px;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
`;

const PhotoModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0,0,0,0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: ${fadeIn} 0.2s ease both;
`;

const PhotoModalBox = styled.div`
  position: relative;
  background: var(--color-modal-bg, #fff);
  border-radius: 16px;
  padding: 16px;
  max-width: 640px;
  width: 100%;
  box-shadow: 0 24px 60px rgba(0,0,0,0.3);
`;

const PhotoModalImg = styled.img`
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 12px;
  display: block;
`;

const PhotoModalClose = styled.button`
  position: absolute;
  top: -12px;
  right: -12px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: #111827;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  &:hover { background: #E91E63; }
`;

const ProductCard = styled.article`
  background: var(--color-surface-solid);
  border-radius: 12px;
  border: 1.5px solid ${({ $inCart }) => $inCart ? "#FECDD3" : "#F3F4F6"};
  overflow: hidden;
  cursor: ${({ $outOfStock }) => $outOfStock ? "not-allowed" : "pointer"};
  opacity: ${({ $outOfStock }) => $outOfStock ? 0.55 : 1};
  transition: all 0.15s;
  animation: ${fadeIn} 0.2s ease both;
  position: relative;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  &:hover { 
    border-color: ${({ $outOfStock, $inCart }) => $outOfStock ? "#F3F4F6" : $inCart ? "#E91E63" : "#D1D5DB"};
    transform: ${({ $outOfStock }) => $outOfStock ? "none" : "translateY(-2px)"};
    box-shadow: ${({ $outOfStock }) => $outOfStock ? "none" : "0 6px 20px rgba(0,0,0,0.07)"};
  }
`;

const ProductThumb = styled.div`
  height: 160px;
  background: var(--pos-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  color: #D1D5DB;
  position: relative;
  overflow: hidden;
  img { width: 100%; height: 100%; object-fit: cover; cursor: zoom-in; }
`;

const DiscountChip = styled.span`
  position: absolute;
  top: 8px;
  left: 8px;
  background: #E91E63;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
`;

const CartQtyBadge = styled.span`
  position: absolute;
  top: 8px;
  right: 8px;
  background: #111827;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ProductBody = styled.div`
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const ProductName = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: var(--pos-heading);
  line-height: 1.4;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ProductCat = styled.div`
  font-size: 11px;
  color: #9CA3AF;
  margin-bottom: 12px;
  text-transform: capitalize;
`;

const PriceRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin-bottom: 12px;
`;

const PriceMain = styled.span`
  font-size: 15px;
  font-weight: 800;
  color: var(--pos-heading);
`;

const PriceOld = styled.span`
  font-size: 11px;
  color: #9CA3AF;
  text-decoration: line-through;
`;

const StockBadge = styled.span`
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 999px;
  background: ${({ $type }) =>
    $type === "out" ? "#FEE2E2" : $type === "low" ? "#FEF3C7" : "#ECFDF5"};
  color: ${({ $type }) =>
    $type === "out" ? "#DC2626" : $type === "low" ? "#D97706" : "#059669"};
`;

const AddToCartBtn = styled.button`
  width: 100%;
  height: 36px;
  border-radius: 8px;
  border: none;
  background: ${({ $outOfStock }) => $outOfStock ? "#F3F4F6" : "#E91E63"};
  color: ${({ $outOfStock }) => $outOfStock ? "#9CA3AF" : "#fff"};
  font-size: 12px;
  font-weight: 600;
  cursor: ${({ $outOfStock }) => $outOfStock ? "not-allowed" : "pointer"};
  transition: all 0.15s;
  margin-top: auto;
  &:hover:not(:disabled) {
    background: ${({ $outOfStock }) => $outOfStock ? "#F3F4F6" : "#C2185B"};
  }
  &:disabled {
    opacity: 0.6;
  }
`;

/* State Cards */
const StateCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  padding: 40px;
  text-align: center;
  animation: ${fadeIn} 0.3s ease;
`;

const StateIcon = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: var(--pos-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: #9CA3AF;
`;

const StateTitle = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: var(--pos-heading);
`;

const StateText = styled.div`
  font-size: 13px;
  color: var(--pos-muted);
  max-width: 260px;
  line-height: 1.6;
`;

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid #F3F4F6;
  border-top-color: #E91E63;
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
`;

/* Right: Order Panel */
const OrderPane = styled.aside`
  background: var(--color-surface-solid);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @media (max-width: 768px) {
    border-left: 0;
    border-top: 1px solid var(--color-border);
    overflow: visible;
  }
`;

const OrderHeader = styled.div`
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
`;

const OrderMeta = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 10px;
`;

const MetaBtn = styled.button`
  flex: 1;
  height: 32px;
  border-radius: 8px;
  border: 1.5px solid ${({ $active }) => $active ? "#E91E63" : "#E5E7EB"};
  background: ${({ $active }) => $active ? "#FFF0F4" : "var(--color-surface-solid, #fff)"};
  color: ${({ $active }) => $active ? "#E91E63" : "#6B7280"};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
`;

const CustomerField = styled.div`
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
`;

const FieldLabel = styled.label`
  font-size: 11px;
  font-weight: 600;
  color: var(--pos-muted);
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
`;

const FieldInput = styled.input`
  width: 100%;
  height: 34px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--pos-text);
  outline: none;
  background: var(--pos-input-bg);
  transition: border-color 0.15s;
  &:focus { border-color: #E91E63; background: var(--color-surface-solid); }
  &::placeholder { color: #9CA3AF; }
`;

/* Cart */
const CartList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 4px; }

  @media (max-width: 768px) {
    max-height: 320px;
  }
`;

const EmptyCart = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 160px;
  color: #9CA3AF;
  font-size: 13px;
  text-align: center;
`;

const CartItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  background: #F9FAFB;
  border: 1px solid #F3F4F6;
  border-radius: 10px;
  animation: ${slideIn} 0.18s ease both;

  @media (max-width: 480px) {
    align-items: flex-start;
    flex-wrap: wrap;
  }
`;

const CartItemInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const CartItemName = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CartItemPrice = styled.div`
  font-size: 11px;
  color: #6B7280;
  margin-top: 1px;
`;

const CartItemTotal = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  white-space: nowrap;
`;

const QtyControl = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const QtyBtn = styled.button`
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid #E5E7EB;
  background: var(--color-surface-solid, #fff);
  color: #374151;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.1s;
  &:hover:not(:disabled) { border-color: #E91E63; color: #E91E63; background: #FFF0F4; }
  &:disabled { opacity: 0.35; cursor: not-allowed; }
`;

const QtyInput = styled.input`
  width: 36px;
  height: 24px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #111827;
  outline: none;
  background: var(--color-input-bg, #fff);
  &:focus { border-color: #E91E63; }
  -moz-appearance: textfield;
  &::-webkit-inner-spin-button, &::-webkit-outer-spin-button { -webkit-appearance: none; }
`;

const RemoveBtn = styled.button`
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: #9CA3AF;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 5px;
  flex-shrink: 0;
  &:hover { background: #FEE2E2; color: #DC2626; }
`;

/* Voucher */
const VoucherSection = styled.div`
  padding: 10px 12px;
  border-top: 1px solid #F3F4F6;
  flex-shrink: 0;
`;

const VoucherRow = styled.div`
  display: flex;
  gap: 6px;
`;

const VoucherInput = styled(FieldInput)`
  font-size: 12px;
  background: var(--color-input-bg, #fff);
`;

const VoucherBtn = styled.button`
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1.5px solid #E91E63;
  background: var(--color-surface-solid, #fff);
  color: #E91E63;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  flex-shrink: 0;
  &:hover { background: #FFF0F4; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
`;

const VoucherMsg = styled.div`
  margin-top: 6px;
  font-size: 11px;
  font-weight: 600;
  color: ${({ $success }) => $success ? "#059669" : "#DC2626"};
  display: flex;
  align-items: center;
  gap: 4px;
`;

/* Summary */
const SummarySection = styled.div`
  padding: 10px 16px;
  border-top: 1px solid #F3F4F6;
  flex-shrink: 0;
`;

const SummaryRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 0;
  font-size: 13px;
  color: ${({ $muted }) => $muted ? "#9CA3AF" : "#374151"};
  font-weight: ${({ $total }) => $total ? 800 : 400};
`;

const SummaryTotal = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0 4px;
  border-top: 1.5px solid #E5E7EB;
  margin-top: 6px;
`;

const TotalLabel = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #374151;
`;

const TotalAmount = styled.div`
  font-size: 22px;
  font-weight: 900;
  color: #111827;
  letter-spacing: -0.5px;
`;

/* Payment Section */
const PaymentSection = styled.div`
  padding: 12px 16px;
  border-top: 1px solid #F3F4F6;
  flex-shrink: 0;
  animation: ${fadeIn} 0.2s ease;
`;

const PaymentMethodGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-bottom: 10px;

  @media (max-width: 480px) {
    grid-template-columns: repeat(3, 1fr);
  }
`;

const PayMethodBtn = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 8px;
  border: 1.5px solid ${({ $active, $color }) => $active ? $color : "#E5E7EB"};
  background: ${({ $active, $color }) => $active ? `${$color}14` : "var(--color-surface-solid, #fff)"};
  color: ${({ $active, $color }) => $active ? $color : "#6B7280"};
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
  &:hover { border-color: ${({ $color }) => $color}; }
  svg { font-size: 14px; }
`;

const AmountRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
`;

const AmountInput = styled(FieldInput)`
  font-size: 16px;
  font-weight: 800;
  text-align: right;
  color: #111827;
`;

const QuickAmounts = styled.div`
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-bottom: 10px;
`;

const QuickBtn = styled.button`
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid #E5E7EB;
  background: #F9FAFB;
  color: #374151;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
  &:hover { border-color: #E91E63; color: #E91E63; background: #FFF0F4; }
`;

const ChangeRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  background: #F0FDF4;
  border: 1px solid #BBF7D0;
  margin-bottom: 10px;
`;

const ChangeLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #059669;
`;

const ChangeAmount = styled.div`
  font-size: 16px;
  font-weight: 900;
  color: #059669;
`;

/* Action Buttons */
const ActionsBar = styled.div`
  padding: 12px 16px;
  border-top: 1px solid #F3F4F6;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
`;

const CheckoutBtn = styled.button`
  width: 100%;
  height: 46px;
  border-radius: 10px;
  border: none;
  background: ${({ disabled }) => disabled ? "#F3F4F6" : "linear-gradient(135deg, #E91E63, #C2185B)"};
  color: ${({ disabled }) => disabled ? "#9CA3AF" : "#fff"};
  font-size: 15px;
  font-weight: 700;
  cursor: ${({ disabled }) => disabled ? "not-allowed" : "pointer"};
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  letter-spacing: -0.2px;
  &:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(233,30,99,0.35); }
  &:active:not(:disabled) { transform: none; box-shadow: none; }
`;

const SecondaryBtnsRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const SecBtn = styled.button`
  height: 36px;
  border-radius: 8px;
  border: 1.5px solid ${({ $color }) => $color || "#E5E7EB"};
  background: var(--color-surface-solid, #fff);
  color: ${({ $color }) => $color || "#374151"};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.12s;
  &:hover { background: ${({ $bg }) => $bg || "var(--color-surface-muted, #F9FAFB)"}; }
  &:disabled { opacity: 0.35; cursor: not-allowed; }
`;

/* Modals */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
  animation: ${fadeIn} 0.15s ease;
`;

const Modal = styled.div`
  background: var(--color-modal-bg, #fff);
  border-radius: 16px;
  width: 100%;
  max-width: ${({ $width }) => $width || "480px"};
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ${popIn} 0.18s ease;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #F3F4F6;
  flex-shrink: 0;
`;

const ModalTitle = styled.div`
  font-size: 16px;
  font-weight: 800;
  color: #111827;
  margin-bottom: 2px;
`;

const ModalSub = styled.div`
  font-size: 12px;
  color: #9CA3AF;
`;

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 4px; }
`;

const ModalFooter = styled.div`
  padding: 16px 24px;
  border-top: 1px solid #F3F4F6;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-shrink: 0;
`;

/* Receipt */
const ReceiptPaper = styled.div`
  background: #fff;
  font-family: 'Courier New', monospace;
  padding: 20px;
  border: 1px dashed #D1D5DB;
  border-radius: 8px;
`;

const ReceiptStore = styled.div`
  text-align: center;
  margin-bottom: 14px;
  h3 { font-size: 16px; font-weight: 900; color: #111827; margin-bottom: 2px; }
  p { font-size: 11px; color: #6B7280; }
`;

const ReceiptDivider = styled.div`
  border-top: 1px dashed #D1D5DB;
  margin: 10px 0;
`;

const ReceiptRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 2px 0;
  color: ${({ $bold }) => $bold ? "#111827" : "#374151"};
  font-weight: ${({ $bold }) => $bold ? 700 : 400};
`;

const ReceiptItemRow = styled.div`
  padding: 4px 0;
  font-size: 12px;
  .item-name { font-weight: 600; color: #111827; }
  .item-meta { display: flex; justify-content: space-between; color: #6B7280; }
`;

const ReceiptTotal = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 0 4px;
  border-top: 1px dashed #D1D5DB;
  font-size: 15px;
  font-weight: 900;
  color: #111827;
  margin-top: 4px;
`;

/* Toast */
const ToastWrap = styled.div`
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ToastItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 10px;
  background: ${({ $type }) =>
    $type === "success" ? "#059669" :
    $type === "error"   ? "#DC2626" :
    $type === "warn"    ? "#D97706" : "#111827"};
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  animation: ${slideIn} 0.2s ease both;
  max-width: 320px;
  position: relative;
  overflow: hidden;
`;

const ToastProgress = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: rgba(255,255,255,0.5);
  border-radius: 0 0 0 10px;
  animation: shrink 3.2s linear forwards;
  @keyframes shrink { from { width: 100%; } to { width: 0%; } }
`;

const HelpOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${fadeIn} 0.2s ease;
`;

const HelpModal = styled.div`
  background: var(--color-modal-bg, #fff);
  border-radius: 16px;
  padding: 28px 32px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 24px 64px rgba(0,0,0,0.3);
`;

const HelpTitle = styled.h2`
  margin: 0 0 18px;
  font-size: 1.25rem;
  color: #111827;
`;

const HelpGrid = styled.div`
  display: grid;
  gap: 10px;
  margin-bottom: 20px;
`;

const HelpRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.9rem;
  color: #374151;
  kbd {
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 3px 8px;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    font-weight: 700;
    color: #111827;
  }
`;

/* Navigation Menu */
const NavMenuContainer = styled.div`
  position: relative;
`;

const NavMenuDropdown = styled.div`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  width: 220px;
  background: var(--color-dropdown-bg, #fff);
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.15);
  z-index: 1000;
  animation: ${fadeIn} 0.15s ease;
  overflow: hidden;
`;

const NavMenuHeader = styled.div`
  padding: 12px 16px;
  background: #F9FAFB;
  border-bottom: 1px solid #E5E7EB;
  font-size: 11px;
  font-weight: 700;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const NavMenuItem = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  svg { color: #6B7280; }
  &:hover {
    background: #F3F4F6;
    color: #E91E63;
    svg { color: #E91E63; }
  }
`;

/* ─── Main Component ────────────────────────────────────────────── */
const CashierPOS = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  /* State */
  const [products, setProducts]           = useState([]);
  const [services, setServices]           = useState([]);
  const [cart, setCart]                   = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeTab, setActiveTab] = useState("products"); // 'products' | 'payment-approvals'
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
      return next.slice(-3); // keep max 3 toasts
    });
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  /* Fullscreen toggle */
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      // Hide navbar and sidebar before entering fullscreen
      const navbar = document.querySelector('.navbar, .sidebar, nav, aside');
      const sidebar = document.querySelector('.sidebar, aside, .sidebar-wrapper, .main-sidebar');
      
      if (navbar) navbar.style.display = 'none';
      if (sidebar) sidebar.style.display = 'none';
      
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
        addToast("Entered fullscreen mode", "success");
      }).catch(() => {
        // Restore navbar and sidebar if fullscreen fails
        if (navbar) navbar.style.display = '';
        if (sidebar) sidebar.style.display = '';
        addToast("Could not enter fullscreen mode", "error");
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
        // Restore navbar and sidebar after exiting fullscreen
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
          return {
            ...item,
            stock: latestStock,
            available_stock: latestStock,
            quantity: latestStock,
          };
        }
        return {
          ...item,
          stock: latestStock,
          available_stock: latestStock,
        };
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
      const res = await apiRequest("/customers");
      const raw = normalizeList(res, ["customers", "data"]);
      setCustomers(raw);
    } catch {
      setCustomers([]);
    }
  }, []);

  useEffect(() => { fetchProducts(); fetchServices(); fetchCustomers(); }, [fetchProducts, fetchServices, fetchCustomers]);

  /* Fetch pending payment count for sidebar badge */
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

  /* Auto-refresh services periodically to sync with receptionist changes */
  useEffect(() => {
    const interval = setInterval(() => {
      fetchServices();
    }, 30000); // Refresh services every 30 seconds
    return () => clearInterval(interval);
  }, [fetchServices]);
  /* Fullscreen state tracking */
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreenNow = !!document.fullscreenElement;
      setIsFullscreen(isFullscreenNow);

      // Restore navbar and sidebar when exiting fullscreen
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

  /* Close nav menu when clicking outside */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target)) {
        setShowNavMenu(false);
      }
    };

    if (showNavMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNavMenu]);

  /* All items = inventory products + services */
  const allItems = useMemo(() => [
    ...products,
    ...services.map(s => ({ ...s, id: `svc-${s.id}`, _serviceId: s.id })),
  ], [products, services]);

  /* Categories */
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
    if (!isService && availableStock <= 0) {
      addToast(`${product.name} is out of stock`, "warn");
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        if (existing.quantity >= availableStock) {
          addToast("Maximum stock reached", "warn");
          return prev;
        }
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

  /* Totals (VAT-inclusive pricing) */
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

  const canCheckout = cart.length > 0 && cart.every((item) => item.quantity <= getAvailableStock(item)) && !checkoutLoading
    && (paymentMethod !== "Cash" || (Number(amountReceived) || 0) >= total);

  /* Barcode / search enter */
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

  /* Keyboard shortcuts */
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
  }, [cart.length, searchQuery, showPaymentSection, completedReceipt, handleSearchEnter]);

  /* Voucher validate */
  const handleValidateVoucher = async () => {
    const code = voucher.trim();
    if (!code) { setVoucherMessage("Please enter a voucher code."); return; }
    setValidatedVoucher(null);
    setVoucherMessage("Voucher validation is not available yet.");
  };

  /* Checkout */
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
      const txId = res?.transaction_id || res?.id || `TRX-${Date.now()}`;
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

  /* Print receipt */
  const handlePrint = (receiptOverride = null) => {
    const receiptToPrint = (receiptOverride && Array.isArray(receiptOverride.items)) ? receiptOverride : completedReceipt;
    if (!receiptToPrint || !Array.isArray(receiptToPrint.items)) return;
    const w = window.open("", "_blank", "width=420,height=700");
    if (!w) { addToast("Allow pop-ups to print receipt", "warn"); return; }
    const itemsHtml = receiptToPrint.items.map(i => {
      const itemTotal = (i.unit_price || 0) * i.quantity;
      return `
      <tr>
        <td>${i.item_name} × ${i.quantity}<br><small>${fmt(i.unit_price)} each</small></td>
        <td style="text-align:right">${fmt(itemTotal)}</td>
      </tr>`;
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

  /* ─── Render ──────────────────────────────────────────────────── */
  return (
    <>
      <GlobalStyle />

      <POSPage>
        {/* ── Top Bar ─────────────────────────────────────────── */}
        <TopBar>
          <TopBarBrand>
            <BrandMark><FontAwesomeIcon icon={faPaw} /></BrandMark>
            Cashier POS
          </TopBarBrand>

          <TopBarCenter>
            <SearchBar>
              <FontAwesomeIcon icon={faBarcode} />
              <SearchInput
                ref={searchRef}
                type="text"
                placeholder="Search product name or scan barcode… (Enter to add)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSearchEnter(); } }}
              />
              {searchQuery && (
                <FontAwesomeIcon icon={faXmark} style={{ cursor: "pointer", color: "#9CA3AF" }}
                  onClick={() => setSearchQuery("")} />
              )}
            </SearchBar>
          </TopBarCenter>

          <ShortcutPills>
            <Pill><kbd>F1</kbd> Help</Pill>
            <Pill><kbd>F2</kbd> Search</Pill>
            <Pill><kbd>F3</kbd> Clear</Pill>
            <Pill><kbd>F4</kbd> Pay</Pill>
            <Pill><kbd>Esc</kbd> Cancel</Pill>
          </ShortcutPills>

          <TopBarRight>
            <NavMenuContainer ref={navMenuRef}>
              <IconBtn onClick={() => setShowNavMenu(!showNavMenu)}>
                <FontAwesomeIcon icon={faBars} /> Menu
              </IconBtn>
              {showNavMenu && (
                <NavMenuDropdown>
                  <NavMenuHeader>Navigate To</NavMenuHeader>
                  <NavMenuItem onClick={() => { navigate('/cashier/dashboard'); setShowNavMenu(false); }}>
                    <FontAwesomeIcon icon={faChartLine} /> Dashboard
                  </NavMenuItem>
                  <NavMenuItem onClick={() => { navigate('/cashier/transactions'); setShowNavMenu(false); }}>
                    <FontAwesomeIcon icon={faClipboardList} /> Transactions
                  </NavMenuItem>
                  <NavMenuItem onClick={() => { navigate('/cashier/reports'); setShowNavMenu(false); }}>
                    <FontAwesomeIcon icon={faChartLine} /> Reports
                  </NavMenuItem>
                  <NavMenuItem onClick={() => { navigate('/cashier/history'); setShowNavMenu(false); }}>
                    <FontAwesomeIcon icon={faHistory} /> History
                  </NavMenuItem>
                  <NavMenuItem onClick={() => { navigate('/cashier/profile'); setShowNavMenu(false); }}>
                    <FontAwesomeIcon icon={faUserCircle} /> Profile
                  </NavMenuItem>
                </NavMenuDropdown>
              )}
            </NavMenuContainer>

            {lowStockCount > 0 && (
              <Badge $type="low"><FontAwesomeIcon icon={faTriangleExclamation} /> {lowStockCount} Low</Badge>
            )}
            {outOfStockCount > 0 && (
              <Badge $type="out"><FontAwesomeIcon icon={faBan} /> {outOfStockCount} Out</Badge>
            )}

            <IconBtn onClick={() => { fetchProducts(); fetchServices(); }}>
              <FontAwesomeIcon icon={faRotateRight} /> Refresh
            </IconBtn>

            <IconBtn $danger onClick={clearOrder} disabled={cart.length === 0}>
              <FontAwesomeIcon icon={faTrash} /> Clear
            </IconBtn>

            <IconBtn onClick={() => setShowHelp(true)} title="Keyboard shortcuts">
              <FontAwesomeIcon icon={faKeyboard} /> Help
            </IconBtn>

            <IconBtn $primary onClick={toggleFullscreen}>
              <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} />
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </IconBtn>
          </TopBarRight>
        </TopBar>

        {/* ── Body ──────────────────────────────────────────────── */}
        <POSBody>
          {/* Left: Categories */}
          <CategoriesPane>
            <PaneHeader>
              <PaneLabel>Browse By</PaneLabel>
              <PaneTitle>Categories</PaneTitle>
            </PaneHeader>
            <CategoryList>
              {categories.map(cat => (
                <CategoryBtn
                  key={cat.id}
                  $active={activeTab === "products" && activeCategory === cat.id}
                  $color={cat.config?.color}
                  $bg={cat.config?.bg}
                  onClick={() => { setActiveTab("products"); setActiveCategory(cat.id); }}
                >
                  <span className="cat-icon">
                    <FontAwesomeIcon icon={cat.config?.icon || faBox} />
                  </span>
                  <span className="cat-label">{cat.label}</span>
                  <span className="cat-count">{cat.count}</span>
                </CategoryBtn>
              ))}
              <div style={{ height: 1, background: "var(--color-border)", margin: "8px 4px" }} />
              <CategoryBtn
                key="payment-approvals"
                $active={activeTab === "payment-approvals"}
                $color="#10b981"
                $bg="#ECFDF5"
                style={{ background: activeTab === "payment-approvals" ? "#ECFDF5" : "rgba(236,253,245,0.5)" }}
                onClick={() => setActiveTab("payment-approvals")}
              >
                <span className="cat-icon">
                  <FontAwesomeIcon icon={faCheckCircle} />
                </span>
                <span className="cat-label">Payment Approvals</span>
                <span className="cat-count" style={{ background: "#10b981", color: "#fff" }}>{pendingCount}</span>
              </CategoryBtn>
            </CategoryList>
          </CategoriesPane>

          {/* Center: Products or Payment Approvals */}
          <ProductsPane>
            {activeTab === "payment-approvals" ? (
              <PaymentApprovals />
            ) : (
              <>
                <ProductsPaneHeader>
                  <div>
                    <PaneLabel>Catalog</PaneLabel>
                    <SectionTitle>
                      {activeCategory === "all" ? "All Products"
                        : categories.find(c => c.id === activeCategory)?.label || "Products"}
                    </SectionTitle>
                  </div>
                  <CountPill title={lastStockSyncAt ? `Last synced ${lastStockSyncAt.toLocaleTimeString()}` : "Stock not synced yet"}>
                    <FontAwesomeIcon icon={faList} />
                    {isRefreshingProducts
                      ? "Refreshing stock..."
                      : `${filteredProducts.length} item${filteredProducts.length !== 1 ? "s" : ""}`}
                  </CountPill>
                </ProductsPaneHeader>

                {loading ? (
                  <StateCard>
                    <Spinner />
                    <StateTitle>Loading products…</StateTitle>
                    <StateText>Fetching inventory from the server.</StateText>
                  </StateCard>
                ) : error ? (
                  <StateCard>
                    <StateIcon><FontAwesomeIcon icon={faTriangleExclamation} /></StateIcon>
                    <StateTitle>Could not load products</StateTitle>
                    <StateText>{error}</StateText>
                    <IconBtn onClick={fetchProducts}><FontAwesomeIcon icon={faRotateRight} /> Retry</IconBtn>
                  </StateCard>
                ) : filteredProducts.length === 0 ? (
                  <StateCard>
                    <StateIcon><FontAwesomeIcon icon={faBoxOpen} /></StateIcon>
                    <StateTitle>No products found</StateTitle>
                    <StateText>Try another category or search term.</StateText>
                  </StateCard>
                ) : (
                  <ProductGrid>
                    {filteredProducts.map(product => {
                  const cartItem = cart.find(i => i.id === product.id);
                  const dPrice   = discountedPrice(product);
                  const hasDisc  = Number(product.discount) > 0;
                  const availableStock = getAvailableStock(product);
                  const outOfStock = availableStock <= 0;
                  const ss = stockStatus(availableStock);

                  return (
                    <ProductCard
                      key={product.id}
                      $inCart={!!cartItem}
                      $outOfStock={outOfStock}
                    >
                      <ProductThumb>
                        {product.image
                          ? <img src={product.image} alt={product.name} onClick={(e) => { e.stopPropagation(); setViewPhotoUrl(product.image); }} />
                          : <FontAwesomeIcon icon={faBoxOpen} />}
                        {hasDisc && <DiscountChip>-{product.discount}%</DiscountChip>}
                        {cartItem && <CartQtyBadge>{cartItem.quantity}</CartQtyBadge>}
                      </ProductThumb>

                      <ProductBody>
                        <ProductName title={product.name}>{product.name}</ProductName>
                        <PriceRow>
                          <PriceMain>{fmt(discountedPrice(product))}</PriceMain>
                          {hasDisc && <PriceOld>{fmt(product.price)}</PriceOld>}
                        </PriceRow>
                        <StockBadge $type={ss.type}>{ss.label}</StockBadge>
                        <AddToCartBtn
                          $outOfStock={outOfStock}
                          onClick={() => addToCart(product)}
                        >
                          {outOfStock ? "Out of Stock" : "Add to Cart"}
                        </AddToCartBtn>
                      </ProductBody>
                    </ProductCard>
                  );
                })}
              </ProductGrid>
            )}
          </>
        )}
      </ProductsPane>

      {/* Right: Order Panel */}
          <OrderPane>
            <OrderHeader>
              <PaneLabel>Current</PaneLabel>
              <PaneTitle>Order Details</PaneTitle>
            </OrderHeader>

            <CustomerField>
              <FieldLabel>
                <FontAwesomeIcon icon={faUser} />
                Customer
              </FieldLabel>
              <select
                style={{
                  width: "100%",
                  border: "1.5px solid var(--color-border)",
                  borderRadius: 8,
                  padding: "9px 10px",
                  fontSize: 13,
                  lineHeight: "16px",
                  color: "var(--pos-text)",
                  background: "var(--pos-input-bg)",
                  outline: "none",
                  marginBottom: 6,
                }}
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
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ""}
                  </option>
                ))}
              </select>
              {!customerId && (
                <FieldInput
                  type="text"
                  placeholder="Type walk-in customer name..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              )}
            </CustomerField>

            {/* Cart */}
            <CartList>
              {cart.length === 0 ? (
                <EmptyCart>
                  <FontAwesomeIcon icon={faShoppingCart} style={{ fontSize: 32, color: "#E5E7EB" }} />
                  <div>
                    <div style={{ fontWeight: 700, color: "#374151", marginBottom: 4 }}>Cart is empty</div>
                    <div>Click a product or scan a barcode to add items.</div>
                  </div>
                </EmptyCart>
              ) : (
                cart.map(item => (
                  <CartItem key={item.id}>
                    <CartItemInfo>
                      <CartItemName title={item.name}>{item.name}</CartItemName>
                      <CartItemPrice>{fmt(discountedPrice(item))} each</CartItemPrice>
                    </CartItemInfo>

                    <QtyControl>
                      <QtyBtn onClick={() => updateQty(item.id, item.quantity - 1)}>
                        <FontAwesomeIcon icon={faMinus} />
                      </QtyBtn>
                      <QtyInput
                        type="number"
                        min="1"
                        max={getAvailableStock(item)}
                        value={item.quantity}
                        onChange={e => updateQty(item.id, e.target.value)}
                      />
                      <QtyBtn
                        onClick={() => updateQty(item.id, item.quantity + 1)}
                        disabled={item.quantity >= getAvailableStock(item)}
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </QtyBtn>
                    </QtyControl>

                    <CartItemTotal>{fmt(discountedPrice(item) * item.quantity)}</CartItemTotal>

                    <RemoveBtn onClick={() => removeFromCart(item.id)}>
                      <FontAwesomeIcon icon={faXmark} />
                    </RemoveBtn>
                  </CartItem>
                ))
              )}
            </CartList>

            {/* Voucher */}
            <VoucherSection>
              <FieldLabel style={{ marginBottom: 6 }}>
                <FontAwesomeIcon icon={faTag} />
                Voucher Code
              </FieldLabel>
              <VoucherRow>
                <VoucherInput
                  type="text"
                  placeholder="Enter voucher code"
                  value={voucher}
                  onChange={e => { setVoucher(e.target.value); setValidatedVoucher(null); setVoucherMessage(""); }}
                />
                <VoucherBtn
                  onClick={handleValidateVoucher}
                  disabled={true}
                  title="Voucher validation is not available yet."
                >
                  Apply
                </VoucherBtn>
              </VoucherRow>
              {voucherMessage && (
                <VoucherMsg $success={!!validatedVoucher}>
                  <FontAwesomeIcon icon={validatedVoucher ? faCheckCircle : faXmark} />
                  {voucherMessage}
                </VoucherMsg>
              )}
            </VoucherSection>

            {/* Summary */}
            <SummarySection>
              <SummaryRow $muted>
                <span>Subtotal (incl. VAT)</span>
                <span>{fmt(subtotal)}</span>
              </SummaryRow>
              <SummaryRow $muted>
                <span>VAT 12%</span>
                <span>{fmt(tax)}</span>
              </SummaryRow>
              {discountAmt > 0 && (
                <SummaryRow $muted>
                  <span style={{ color: "#059669" }}>
                    Discount {validatedVoucher ? `(${validatedVoucher.code})` : ""}
                  </span>
                  <span style={{ color: "#059669" }}>-{fmt(discountAmt)}</span>
                </SummaryRow>
              )}
              <SummaryTotal>
                <TotalLabel>Total</TotalLabel>
                <TotalAmount>{fmt(total)}</TotalAmount>
              </SummaryTotal>
              {showPaymentSection && paymentMethod === "Cash" && (Number(amountReceived) || 0) >= total && (
                <ChangeRow style={{ marginTop: 6 }}>
                  <ChangeLabel>Change</ChangeLabel>
                  <ChangeAmount>{fmt(change)}</ChangeAmount>
                </ChangeRow>
              )}
            </SummarySection>

            {/* Payment */}
            {showPaymentSection && (
              <PaymentSection>
                <FieldLabel style={{ marginBottom: 8 }}>
                  <FontAwesomeIcon icon={faCreditCard} />
                  Payment Method
                </FieldLabel>
                <PaymentMethodGrid>
                  {PAYMENT_METHODS.map(pm => (
                    <PayMethodBtn
                      key={pm.value}
                      $active={paymentMethod === pm.value}
                      $color={pm.color}
                      onClick={() => setPaymentMethod(pm.value)}
                    >
                      <FontAwesomeIcon icon={pm.icon} />
                      {pm.label}
                    </PayMethodBtn>
                  ))}
                </PaymentMethodGrid>

                {paymentMethod === "Cash" && (
                  <>
                    <FieldLabel style={{ marginBottom: 6 }}>
                      <FontAwesomeIcon icon={faMoneyBillWave} />
                      Amount Received
                    </FieldLabel>
                    <AmountRow>
                      <AmountInput
                        type="number"
                        min="0"
                        placeholder={total.toFixed(2)}
                        value={amountReceived}
                        onChange={e => setAmountReceived(e.target.value)}
                      />
                    </AmountRow>
                    <QuickAmounts>
                      {QUICK_AMOUNTS.map(a => (
                        <QuickBtn key={a} onClick={() => setAmountReceived(String((Number(amountReceived) || 0) + a))}>
                          +₱{a.toLocaleString()}
                        </QuickBtn>
                      ))}
                    </QuickAmounts>
                  </>
                )}

                {(paymentMethod === "GCash" || paymentMethod === "Maya") && (
                  <>
                    <FieldLabel style={{ marginBottom: 6 }}>
                      <FontAwesomeIcon icon={faMobileScreen} />
                      Reference Number
                    </FieldLabel>
                    <AmountRow>
                      <AmountInput
                        type="text"
                        placeholder="Enter reference number"
                        value={referenceNumber}
                        onChange={e => setReferenceNumber(e.target.value)}
                      />
                    </AmountRow>
                  </>
                )}
              </PaymentSection>
            )}

            {/* Actions */}
            <ActionsBar>
              {!showPaymentSection ? (
                <CheckoutBtn
                  onClick={() => setShowPaymentSection(true)}
                  disabled={cart.length === 0}
                >
                  <FontAwesomeIcon icon={faCalculator} />
                  Proceed to Payment — {fmt(total)}
                </CheckoutBtn>
              ) : (
                <CheckoutBtn onClick={handleCheckout} disabled={!canCheckout}>
                  <FontAwesomeIcon icon={checkoutLoading ? faClock : faCheckCircle} />
                  {checkoutLoading ? "Processing…" : `Complete Payment — ${fmt(total)}`}
                </CheckoutBtn>
              )}

              <SecondaryBtnsRow>
                <SecBtn
                  $color="#DC2626"
                  $bg="#FEF2F2"
                  onClick={clearOrder}
                  disabled={cart.length === 0}
                >
                  <FontAwesomeIcon icon={faTrash} />
                  Clear Cart
                </SecBtn>
              </SecondaryBtnsRow>

              {recentSale && (
                <div style={{ padding: "10px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#059669", fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" }}>Last Sale</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{recentSale.transaction_id}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: "#059669" }}>{fmt(recentSale.total)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <SecBtn style={{ flex: 1 }} $color="#059669" $bg="#F0FDF4"
                      onClick={() => setCompletedReceipt(recentSale)}>
                      <FontAwesomeIcon icon={faReceipt} /> View Receipt
                    </SecBtn>
                    <SecBtn style={{ flex: 1 }} $color="#9CA3AF" $bg="#F9FAFB"
                      onClick={() => setRecentSale(null)}>
                      Dismiss
                    </SecBtn>
                  </div>
                </div>
              )}
            </ActionsBar>
          </OrderPane>
        </POSBody>
      </POSPage>

      {/* ── Receipt Modal ──────────────────────────────────────── */}
      {completedReceipt && (
        <Overlay onClick={() => setCompletedReceipt(null)}>
          <Modal $width="440px" onClick={e => e.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Receipt Preview</ModalTitle>
                <ModalSub>{completedReceipt.transaction_id} · {completedReceipt.date}</ModalSub>
              </div>
              <RemoveBtn onClick={() => setCompletedReceipt(null)} style={{ width: 30, height: 30 }}>
                <FontAwesomeIcon icon={faXmark} />
              </RemoveBtn>
            </ModalHeader>

            <ModalBody>
              <ReceiptPaper>
                <ReceiptStore>
                  <h3>Pawesome Retreat Inc.</h3>
                  <p>Official Cashier Receipt · {completedReceipt.date}</p>
                </ReceiptStore>

                <ReceiptDivider />

                <ReceiptRow><span>Transaction</span><span>{completedReceipt.transaction_id}</span></ReceiptRow>
                <ReceiptRow><span>Customer</span><span>{completedReceipt.customer_name}</span></ReceiptRow>
                <ReceiptRow><span>Payment</span><span>{completedReceipt.payment_method}</span></ReceiptRow>
                {completedReceipt.reference_number && (
                  <ReceiptRow><span>Reference</span><span>{completedReceipt.reference_number}</span></ReceiptRow>
                )}

                <ReceiptDivider />

                {completedReceipt.items.map((item, idx) => {
                  const itemVatPrice = (item.unit_price || 0) * (1 + TAX_RATE);
                  const itemVatTotal = itemVatPrice * item.quantity;
                  const itemVatAmt = (item.unit_price || 0) * TAX_RATE * item.quantity;
                  return (
                    <ReceiptItemRow key={idx}>
                      <div className="item-name">{item.item_name}</div>
                      <div className="item-meta">
                        <span>{item.quantity} × {fmt(itemVatPrice)} (VAT {fmt(itemVatAmt)})</span>
                        <span>{fmt(itemVatTotal)}</span>
                      </div>
                    </ReceiptItemRow>
                  );
                })}

                <ReceiptDivider />

                <ReceiptRow><span>Subtotal (incl. VAT)</span><span>{fmt(completedReceipt.subtotal)}</span></ReceiptRow>
                <ReceiptRow><span>VAT 12%</span><span>{fmt(completedReceipt.tax)}</span></ReceiptRow>
                <ReceiptRow><span>Discount</span><span>-{fmt(completedReceipt.discount)}</span></ReceiptRow>
                <ReceiptTotal>
                  <span>TOTAL</span>
                  <span>{fmt(completedReceipt.total)}</span>
                </ReceiptTotal>
                <ReceiptRow><span>Received</span><span>{fmt(completedReceipt.amount_received)}</span></ReceiptRow>
                <ReceiptRow $bold><span>Change</span><span>{fmt(completedReceipt.change)}</span></ReceiptRow>

                <ReceiptDivider />

                <div style={{ textAlign: "center", fontSize: 11, color: "#9CA3AF", lineHeight: 1.6 }}>
                  Thank you for shopping with us!<br />
                  Please keep this receipt for reference.
                </div>
              </ReceiptPaper>
            </ModalBody>

            <ModalFooter>
              <SecBtn $color="#9CA3AF" $bg="#F9FAFB" style={{ flex: 1, height: 40 }}
                onClick={() => setCompletedReceipt(null)}>
                Close
              </SecBtn>
              <CheckoutBtn style={{ flex: 2, height: 40, fontSize: 13 }} onClick={() => handlePrint()}>
                <FontAwesomeIcon icon={faPrint} /> Print Receipt
              </CheckoutBtn>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}

      {/* ── Photo View Modal ──────────────────────────────────── */}
      {viewPhotoUrl && (
        <PhotoModalOverlay onClick={() => setViewPhotoUrl(null)}>
          <PhotoModalBox onClick={(e) => e.stopPropagation()}>
            <PhotoModalClose onClick={() => setViewPhotoUrl(null)}>
              <FontAwesomeIcon icon={faXmark} />
            </PhotoModalClose>
            <PhotoModalImg src={viewPhotoUrl} alt="Product" />
          </PhotoModalBox>
        </PhotoModalOverlay>
      )}

      {/* ── Help Modal ─────────────────────────────────────────── */}
      {showHelp && (
        <HelpOverlay onClick={() => setShowHelp(false)}>
          <HelpModal onClick={(e) => e.stopPropagation()}>
            <HelpTitle><FontAwesomeIcon icon={faKeyboard} style={{ marginRight: 10 }} />Keyboard Shortcuts</HelpTitle>
            <HelpGrid>
              <HelpRow><span>Open this help</span><kbd>F1</kbd></HelpRow>
              <HelpRow><span>Focus search bar</span><kbd>F2</kbd></HelpRow>
              <HelpRow><span>Clear cart / order</span><kbd>F3</kbd></HelpRow>
              <HelpRow><span>Open payment section</span><kbd>F4</kbd></HelpRow>
              <HelpRow><span>Cancel / close modal</span><kbd>Esc</kbd></HelpRow>
              <HelpRow><span>Add scanned product</span><kbd>Enter</kbd></HelpRow>
            </HelpGrid>
            <IconBtn onClick={() => setShowHelp(false)} style={{ width: "100%", justifyContent: "center" }}>
              <FontAwesomeIcon icon={faXmark} /> Close
            </IconBtn>
          </HelpModal>
        </HelpOverlay>
      )}

      {/* ── Toasts ──────────────────────────────────────────────── */}
      <ToastWrap>
        {toasts.map(t => (
          <ToastItem key={t.id} $type={t.type}>
            <FontAwesomeIcon icon={
              t.type === "success" ? faCheckCircle :
              t.type === "error"   ? faXmark :
              t.type === "warn"    ? faTriangleExclamation :
              faBolt
            } />
            {t.message}
            <ToastProgress />
          </ToastItem>
        ))}
      </ToastWrap>
    </>
  );
};

export default CashierPOS;
