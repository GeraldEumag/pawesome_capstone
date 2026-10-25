import React from "react";
import { faWrench } from "@fortawesome/free-solid-svg-icons";
import Modal from "../shared/Modal";
import ServiceCatalogManager from "../shared/catalog/ServiceCatalogManager";

/**
 * Quick-access modal used across receptionist screens — wraps the shared
 * ServiceCatalogManager so every entry point manages the same catalog.
 */
const ServiceManagerModal = ({ onClose }) => (
  <Modal
    onClose={onClose}
    title="Manage Services & Rooms"
    icon={faWrench}
    size="xl"
    showClose
  >
    <ServiceCatalogManager apiBase="/receptionist" title="" subtitle="" />
  </Modal>
);

export default ServiceManagerModal;
