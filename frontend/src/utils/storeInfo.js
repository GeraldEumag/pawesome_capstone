/**
 * Single source of truth for store/business information.
 * Used by every receipt, invoice, and print component in the system.
 * Update here once and it propagates everywhere.
 */
export const STORE_INFO = {
  name: "Pawesome Retreat Inc.",
  address: "Aldana Street, San Isidro\nVillage, Las Piñas City,\nPhilippines 1740",
  email: "pawesomeretreat24@gmail.com",
  phone: "(02) 8XXX-XXXX",
  tagline: "Professional Veterinary & Pet Hotel Services",
  vatRate: 0.12, // 12% VAT (VAT-inclusive pricing) — display label only;
               // receipt VAT amounts come from the backend breakdown.
};
