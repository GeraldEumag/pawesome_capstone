import { THEME_PRESETS, getPreset, DEFAULT_PRESET_KEY } from "../config/themePresets";

// ===== CENTRALIZED THEME MANAGEMENT ===== //

// Apply a color preset by injecting CSS vars into :root
export const applyThemeColor = (presetKey) => {
  const preset = getPreset(presetKey);
  if (!preset) return;

  const root = document.documentElement;
  root.style.setProperty("--color-primary", preset.primary);
  root.style.setProperty("--color-primary-light", preset.primaryLight);
  root.style.setProperty("--color-primary-soft", preset.primarySoft);
  root.style.setProperty("--color-primary-hover", preset.primaryHover);
  root.style.setProperty("--color-bg", preset.bg);
  root.style.setProperty("--color-bg-gradient", preset.bgGradient);
  root.style.setProperty("--color-border", preset.border);
  root.style.setProperty("--shadow-card", preset.shadowCard);
  root.style.setProperty("--shadow-primary", preset.shadowPrimary);

  localStorage.setItem("theme_color", preset.key);
};

// Fetch system theme from backend and apply it globally
export const fetchAndApplySystemTheme = async () => {
  try {
    const baseUrl =
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
      (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) ||
      "/api";
    const res = await fetch(`${baseUrl}/settings/public`);
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    const key = data.theme_color || DEFAULT_PRESET_KEY;
    applyThemeColor(key);
    localStorage.setItem("theme_color", key);
    return key;
  } catch {
    // Fallback to localStorage or default
    const cached = localStorage.getItem("theme_color") || DEFAULT_PRESET_KEY;
    applyThemeColor(cached);
    return cached;
  }
};

// Get current color preset key
export const getCurrentThemeColor = () =>
  localStorage.getItem("theme_color") || DEFAULT_PRESET_KEY;

