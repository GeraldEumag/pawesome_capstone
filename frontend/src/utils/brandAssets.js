/**
 * Shared brand assets for generated documents (PDF exports, receipts).
 * Loads the official Pawesome logo once and caches the data URL so repeat
 * exports never refetch. The logo is a bundled local asset — no remote URL,
 * no user-controlled path.
 */
import brandLogoUrl from "../assets/pawesome.jpg";

let logoPromise = null;

/**
 * Resolve the official logo as a data URL, or null when it cannot be loaded
 * (offline dev, missing asset). Never rejects — callers treat null as
 * "render the document without a logo".
 */
export const loadBrandLogo = () => {
  if (!logoPromise) {
    logoPromise = (async () => {
      try {
        const response = await fetch(brandLogoUrl);
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })();
  }
  return logoPromise;
};
