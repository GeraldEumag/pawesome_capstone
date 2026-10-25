import React from "react";
import ServiceCatalogManager from "../shared/catalog/ServiceCatalogManager";

/**
 * Veterinary service catalog — restricted to medical categories both here
 * (categoryScope="vet") and server-side via Service::VET_CATEGORIES.
 */
const VetServices = () => (
  <ServiceCatalogManager
    apiBase="/veterinary"
    categoryScope="vet"
    tabs={["services"]}
    title="Services Management"
    subtitle="Manage veterinary services offered to customers — medical categories only."
  />
);

export default VetServices;
