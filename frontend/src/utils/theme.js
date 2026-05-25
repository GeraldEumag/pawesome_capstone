import React from "react";
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
    const baseUrl = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
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

// Apply theme to the document
export const applyTheme = (theme) => {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  const root = document.documentElement;

  // Clean up any existing dark mode classes
  document.body.classList.remove("dark", "dark-mode", "dark-theme", "night-mode");
  document.documentElement.classList.remove("dark", "dark-mode", "dark-theme", "night-mode");
  document.body.removeAttribute("data-theme");

  root.setAttribute("data-theme", normalizedTheme);
  localStorage.setItem("theme", normalizedTheme);
};

// Get current theme from localStorage or default to light
export const getCurrentTheme = () => {
  return localStorage.getItem("theme") || "light";
};

// Toggle theme between light and dark
export const toggleTheme = () => {
  const currentTheme = getCurrentTheme();
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(newTheme);
  return newTheme;
};

// Initialize theme on app load
export const initializeTheme = () => {
  const savedTheme = getCurrentTheme();
  applyTheme(savedTheme);
  return savedTheme;
};

// Hook for React components to use theme
export const useTheme = () => {
  const [theme, setTheme] = React.useState(getCurrentTheme());

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  React.useEffect(() => {
    // Listen for storage changes (for cross-tab sync)
    const handleStorageChange = (e) => {
      if (e.key === "theme") {
        const newTheme = e.newValue || "light";
        applyTheme(newTheme);
        setTheme(newTheme);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const toggle = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    return newTheme;
  };

  const updateTheme = (nextTheme) => {
    const normalizedTheme = nextTheme === "dark" ? "dark" : "light";
    setTheme(normalizedTheme);
    return normalizedTheme;
  };

  return {
    theme,
    isDark: theme === "dark",
    isLight: theme === "light",
    toggle,
    setTheme: updateTheme,
  };
};
