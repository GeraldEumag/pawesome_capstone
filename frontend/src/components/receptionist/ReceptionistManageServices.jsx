import React from "react";
import ServiceCatalogManager from "../shared/catalog/ServiceCatalogManager";

const ReceptionistManageServices = () => (
  <ServiceCatalogManager
    apiBase="/receptionist"
    title="Manage Services"
    subtitle="Configure the service catalog, hotel rooms, and boarding/daycare rooms"
  />
);

export default ReceptionistManageServices;
