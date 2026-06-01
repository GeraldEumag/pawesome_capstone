import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faStethoscope,
  faPlus,
  faEdit,
  faTrash,
  faSearch,
  faSpinner,
  faExclamationTriangle,
  faRotateRight,
  faTimes,
  faSave,
  faPaw,
  faClock,
  faTag,
  faCheckCircle,
  faBan,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import { useTheme } from "../../utils/theme";
import styled, { createGlobalStyle } from "styled-components";
import "./theme.css";

const GlobalStyle = createGlobalStyle`
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
`;

const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--veterinary-page-bg);
  padding: 32px;
  font-family: 'Inter', sans-serif;
  color: var(--veterinary-text-primary);

  @media (max-width: 768px) {
    padding: 16px;
  }
`;

const HeroSection = styled.div`
  background: linear-gradient(135deg, var(--veterinary-primary-light) 0%, var(--veterinary-primary) 100%);
  border-radius: 24px;
  padding: 40px;
  margin-bottom: 32px;
  color: var(--veterinary-text-on-primary);
  position: relative;
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 24px;
  }

  &::before {
    content: '';
    position: absolute;
    top: -50%;
    right: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
    animation: float 20s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    50% { transform: translate(-30px, -30px) rotate(180deg); }
  }
`;

const HeroContent = styled.div`
  position: relative;
  z-index: 1;
`;

const HeroTitle = styled.h1`
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0 0 12px 0;
  background: linear-gradient(135deg, var(--veterinary-text-on-primary) 0%, rgba(255,255,255,0.9) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const HeroSubtitle = styled.p`
  font-size: 1.1rem;
  margin: 0 0 24px 0;
  opacity: 0.95;
  line-height: 1.6;
`;

const HeroActions = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
`;

const PrimaryButton = styled.button`
  background: linear-gradient(135deg, var(--veterinary-card-bg) 0%, var(--veterinary-glass-bg) 100%);
  color: var(--veterinary-primary);
  border: none;
  padding: 12px 24px;
  border-radius: 16px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.1);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

const SecondaryButton = styled.button`
  background: var(--veterinary-glass-bg);
  color: var(--veterinary-text-primary);
  border: 2px solid var(--veterinary-glass-border);
  padding: 12px 24px;
  border-radius: 16px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  backdrop-filter: blur(10px);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(255,95,147,0.2);
    border-color: var(--veterinary-primary);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

const SearchSection = styled.div`
  margin-bottom: 32px;
`;

const SearchContainer = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
  background: var(--veterinary-glass-bg);
  border: 2px solid var(--veterinary-glass-border);
  border-radius: 20px;
  padding: 16px 24px;
  backdrop-filter: blur(10px);
  box-shadow: var(--veterinary-glass-shadow);
`;

const SearchIcon = styled.div`
  color: var(--veterinary-text-muted);
  font-size: 1.1rem;
`;

const SearchInput = styled.input`
  flex: 1;
  border: none;
  background: transparent;
  font-size: 1rem;
  color: var(--veterinary-text-primary);
  outline: none;

  &::placeholder {
    color: var(--veterinary-text-muted);
  }
`;

const FilterSelect = styled.select`
  border: 2px solid var(--veterinary-glass-border);
  border-radius: 12px;
  padding: 8px 16px;
  background: var(--veterinary-card-bg);
  font-size: 0.95rem;
  color: var(--veterinary-text-primary);
  cursor: pointer;
  transition: all 0.3s ease;

  &:focus {
    outline: none;
    border-color: var(--veterinary-primary);
    box-shadow: 0 0 0 3px rgba(255,95,147,0.1);
  }
`;

const ServicesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const ServiceCard = styled.div`
  background: var(--veterinary-glass-bg);
  border: 2px solid var(--veterinary-glass-border);
  border-radius: 20px;
  padding: 24px;
  backdrop-filter: blur(10px);
  box-shadow: var(--veterinary-glass-shadow);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 25px 50px rgba(255,95,147,0.2);
  }
`;

const ServiceHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const ServiceInfo = styled.div`
  flex: 1;
`;

const ServiceName = styled.h3`
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--veterinary-text-primary);
  margin: 0 0 8px 0;
`;

const ServiceCategory = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: linear-gradient(135deg, var(--veterinary-primary-light) 0%, var(--veterinary-primary) 100%);
  color: var(--veterinary-text-on-primary);
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
`;

const ServiceActions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button`
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &.edit {
    background: linear-gradient(135deg, var(--veterinary-info) 0%, var(--veterinary-info-dark, #3182ce) 100%);
    color: var(--veterinary-text-on-primary);

    &:hover {
      transform: scale(1.1);
      box-shadow: 0 4px 15px rgba(66,153,225,0.4);
    }
  }

  &.delete {
    background: linear-gradient(135deg, var(--veterinary-error) 0%, var(--veterinary-error-dark, #e53e3e) 100%);
    color: var(--veterinary-text-on-primary);

    &:hover {
      transform: scale(1.1);
      box-shadow: 0 4px 15px rgba(245,101,101,0.4);
    }
  }

  &.toggle {
    background: ${props => props.active ? 'var(--veterinary-success)' : 'var(--veterinary-warning)'};
    color: var(--veterinary-text-on-primary);

    &:hover {
      transform: scale(1.1);
      box-shadow: 0 4px 15px ${props => props.active ? 'rgba(72,187,120,0.4)' : 'rgba(237,137,54,0.4)'};
    }
  }
`;

const ServiceDetails = styled.div`
  display: grid;
  gap: 12px;
`;

const DetailItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const DetailIcon = styled.div`
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, var(--veterinary-primary-light) 0%, var(--veterinary-primary) 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--veterinary-text-on-primary);
  font-size: 1rem;
`;

const DetailContent = styled.div`
  flex: 1;
`;

const DetailLabel = styled.div`
  font-size: 0.85rem;
  color: var(--veterinary-text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const DetailValue = styled.div`
  font-size: 1rem;
  color: var(--veterinary-text-primary);
  font-weight: 600;
`;

const ServiceDescription = styled.p`
  color: var(--veterinary-text-secondary);
  line-height: 1.6;
  margin: 16px 0 0 0;
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
`;

const Modal = styled.div`
  background: var(--veterinary-glass-bg);
  border: 2px solid var(--veterinary-glass-border);
  border-radius: 24px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--veterinary-glass-shadow);
  animation: slideInUp 0.3s ease;
`;

const ModalHeader = styled.div`
  padding: 24px;
  background: linear-gradient(135deg, var(--veterinary-primary-light) 0%, var(--veterinary-primary) 100%);
  color: var(--veterinary-text-on-primary);
  border-radius: 22px 22px 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ModalTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
`;

const CloseButton = styled.button`
  background: var(--veterinary-glass-bg);
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--veterinary-text-on-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;

  &:hover {
    background: var(--veterinary-card-bg);
  }
`;

const ModalBody = styled.div`
  padding: 24px;
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--veterinary-text-primary);
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--veterinary-glass-border);
  border-radius: 12px;
  background: var(--veterinary-card-bg);
  font-size: 0.95rem;
  transition: all 0.3s ease;

  &:focus {
    outline: none;
    border-color: var(--veterinary-primary);
    box-shadow: 0 0 0 3px rgba(255,95,147,0.1);
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--veterinary-glass-border);
  border-radius: 12px;
  background: var(--veterinary-card-bg);
  font-size: 0.95rem;
  transition: all 0.3s ease;
  resize: vertical;
  min-height: 100px;

  &:focus {
    outline: none;
    border-color: var(--veterinary-primary);
    box-shadow: 0 0 0 3px rgba(255,95,147,0.1);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--veterinary-glass-border);
  border-radius: 12px;
  background: var(--veterinary-card-bg);
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.3s ease;

  &:focus {
    outline: none;
    border-color: var(--veterinary-primary);
    box-shadow: 0 0 0 3px rgba(255,95,147,0.1);
  }
`;

const ModalActions = styled.div`
  padding: 24px;
  border-top: 2px solid var(--veterinary-glass-border);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: var(--veterinary-text-muted);
`;

const EmptyStateIcon = styled.div`
  font-size: 4rem;
  margin-bottom: 16px;
  opacity: 0.5;
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: var(--veterinary-text-muted);
`;

const ErrorAlert = styled.div`
  background: linear-gradient(135deg, rgba(245,101,101,0.1) 0%, rgba(245,101,101,0.05) 100%);
  border: 2px solid rgba(245,101,101,0.2);
  border-radius: 16px;
  padding: 16px 20px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--veterinary-error);
  font-weight: 600;
`;

const VetServices = () => {
  const { theme } = useTheme();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "Consultation",
    price: "",
    description: "",
    duration_minutes: "",
  });

  const categories = [
    "all",
    "Consultation",
    "Grooming",
    "Vaccination",
    "Surgery",
    "Dental",
    "Boarding",
    "Other"
  ];

  const fetchServices = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError("");
      }

      const response = await apiRequest("/admin/services");
      setServices(response.data || []);
    } catch (err) {
      console.error("Failed to fetch services:", err);
      setError("Failed to load services. Please try again.");
      setServices([]);
      
      if (!silent) {
        toast.error("Failed to load services.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchServices(true);
  };

  const handleCreateService = async () => {
    try {
      const response = await apiRequest("/admin/services", {
        method: "POST",
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          duration_minutes: parseInt(formData.duration_minutes) || null,
          is_active: true,
        }),
      });

      setServices([...services, response]);
      setShowCreateModal(false);
      resetForm();
      toast.success("Service created successfully!");
    } catch (err) {
      console.error("Failed to create service:", err);
      toast.error("Failed to create service. Please try again.");
    }
  };

  const handleUpdateService = async () => {
    try {
      const response = await apiRequest(`/admin/services/${selectedService.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          duration_minutes: parseInt(formData.duration_minutes) || null,
        }),
      });

      setServices(services.map(service => 
        service.id === selectedService.id ? response : service
      ));
      setShowEditModal(false);
      resetForm();
      toast.success("Service updated successfully!");
    } catch (err) {
      console.error("Failed to update service:", err);
      toast.error("Failed to update service. Please try again.");
    }
  };

  const handleDeleteService = (serviceId) => {
    setServiceToDelete(serviceId);
    setShowDeleteModal(true);
  };

  const confirmDeleteService = async () => {
    if (!serviceToDelete) return;

    try {
      await apiRequest(`/admin/services/${serviceToDelete}`, {
        method: "DELETE",
      });

      setServices(services.filter(service => service.id !== serviceToDelete));
      setShowDeleteModal(false);
      setServiceToDelete(null);
      toast.success("Service deleted successfully!");
    } catch (err) {
      console.error("Failed to delete service:", err);
      toast.error("Failed to delete service. Please try again.");
    }
  };

  const cancelDeleteService = () => {
    setShowDeleteModal(false);
    setServiceToDelete(null);
  };

  const handleToggleService = async (serviceId, currentStatus) => {
    try {
      await apiRequest(`/admin/services/${serviceId}`, {
        method: "PUT",
        body: JSON.stringify({
          is_active: !currentStatus,
        }),
      });

      setServices(services.map(service => 
        service.id === serviceId 
          ? { ...service, is_active: !currentStatus }
          : service
      ));
      
      toast.success(`Service ${!currentStatus ? 'activated' : 'deactivated'} successfully!`);
    } catch (err) {
      console.error("Failed to toggle service:", err);
      toast.error("Failed to update service status.");
    }
  };

  const openEditModal = (service) => {
    setSelectedService(service);
    setFormData({
      name: service.name,
      category: service.category,
      price: service.price,
      description: service.description || "",
      duration_minutes: service.duration_minutes || "",
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      category: "Consultation",
      price: "",
      description: "",
      duration_minutes: "",
    });
    setSelectedService(null);
  };

  const filteredServices = services.filter(service => {
    const matchesSearch = service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         service.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || service.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <>
      <GlobalStyle />
      <PageContainer style={{ background: `var(--veterinary-page-bg)` }} className={`theme-${theme}`}>
        <HeroSection style={{ background: `linear-gradient(135deg, var(--veterinary-primary-light) 0%, var(--veterinary-primary) 100%)` }}>
          <HeroContent>
            <HeroTitle>Services Management</HeroTitle>
            <HeroSubtitle>
              Manage veterinary services offered to customers. Create, edit, and organize services that appear in booking forms.
            </HeroSubtitle>
            <HeroActions>
              <SecondaryButton
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <FontAwesomeIcon icon={faRotateRight} className={refreshing ? "spin" : ""} />
                {refreshing ? "Refreshing..." : "Refresh"}
              </SecondaryButton>

              <PrimaryButton onClick={() => setShowCreateModal(true)}>
                <FontAwesomeIcon icon={faPlus} />
                Create Service
              </PrimaryButton>
            </HeroActions>
          </HeroContent>
        </HeroSection>

        {error && (
          <ErrorAlert>
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <span>{error}</span>
          </ErrorAlert>
        )}

        <SearchSection>
          <SearchContainer>
            <SearchIcon>
              <FontAwesomeIcon icon={faSearch} />
            </SearchIcon>
            <SearchInput
              type="text"
              placeholder="Search services by name or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FilterSelect
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              {categories.map(category => (
                <option key={category} value={category}>
                  {category === "all" ? "All Categories" : category}
                </option>
              ))}
            </FilterSelect>
          </SearchContainer>
        </SearchSection>

        {loading ? (
          <LoadingState>
            <FontAwesomeIcon icon={faSpinner} className="spin" />
            <p>Loading services...</p>
          </LoadingState>
        ) : filteredServices.length === 0 ? (
          <EmptyState>
            <EmptyStateIcon>
              <FontAwesomeIcon icon={faStethoscope} />
            </EmptyStateIcon>
            <h3>No services found</h3>
            <p>
              {searchTerm || categoryFilter !== "all"
                ? "Try adjusting your search or filters."
                : "Start by creating your first service."}
            </p>
          </EmptyState>
        ) : (
          <ServicesGrid>
            {filteredServices.map((service) => (
              <ServiceCard key={service.id}>
                <ServiceHeader>
                  <ServiceInfo>
                    <ServiceName>{service.name}</ServiceName>
                    <ServiceCategory>
                      <FontAwesomeIcon icon={faTag} />
                      {service.category}
                    </ServiceCategory>
                  </ServiceInfo>
                  <ServiceActions>
                    <ActionButton
                      className="toggle"
                      active={service.is_active}
                      onClick={() => handleToggleService(service.id, service.is_active)}
                      title={service.is_active ? "Deactivate service" : "Activate service"}
                    >
                      <FontAwesomeIcon icon={service.is_active ? faCheckCircle : faBan} />
                    </ActionButton>
                    <ActionButton
                      className="edit"
                      onClick={() => openEditModal(service)}
                      title="Edit service"
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </ActionButton>
                    <ActionButton
                      className="delete"
                      onClick={() => handleDeleteService(service.id)}
                      title="Delete service"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </ActionButton>
                  </ServiceActions>
                </ServiceHeader>

                <ServiceDetails>
                  <DetailItem>
                    <DetailIcon>
                      <FontAwesomeIcon icon={faPaw} />
                    </DetailIcon>
                    <DetailContent>
                      <DetailLabel>Price</DetailLabel>
                      <DetailValue>₱{parseFloat(service.price).toFixed(2)}</DetailValue>
                    </DetailContent>
                  </DetailItem>

                  {service.duration_minutes && (
                    <DetailItem>
                      <DetailIcon>
                        <FontAwesomeIcon icon={faClock} />
                      </DetailIcon>
                      <DetailContent>
                        <DetailLabel>Duration</DetailLabel>
                        <DetailValue>{service.duration_minutes} minutes</DetailValue>
                      </DetailContent>
                    </DetailItem>
                  )}
                </ServiceDetails>

                {service.description && (
                  <ServiceDescription>{service.description}</ServiceDescription>
                )}

                <ServiceCategory style={{ marginTop: '16px', opacity: service.is_active ? 1 : 0.6 }}>
                  <FontAwesomeIcon icon={service.is_active ? faCheckCircle : faBan} />
                  {service.is_active ? "Active" : "Inactive"}
                </ServiceCategory>
              </ServiceCard>
            ))}
          </ServicesGrid>
        )}

        {/* Create Service Modal */}
        {showCreateModal && (
          <ModalOverlay onClick={() => setShowCreateModal(false)}>
            <Modal onClick={(e) => e.stopPropagation()}>
              <ModalHeader>
                <ModalTitle>Create New Service</ModalTitle>
                <CloseButton onClick={() => setShowCreateModal(false)}>
                  <FontAwesomeIcon icon={faTimes} />
                </CloseButton>
              </ModalHeader>

              <ModalBody>
                <FormGroup>
                  <Label>Service Name *</Label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., General Consultation"
                    required
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Category *</Label>
                  <Select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {categories.filter(cat => cat !== "all").map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                </FormGroup>

                <FormGroup>
                  <Label>Price (₱) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                    placeholder="e.g., 30"
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe the service and what it includes..."
                  />
                </FormGroup>
              </ModalBody>

              <ModalActions>
                <SecondaryButton onClick={() => setShowCreateModal(false)}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton onClick={handleCreateService}>
                  <FontAwesomeIcon icon={faSave} />
                  Create Service
                </PrimaryButton>
              </ModalActions>
            </Modal>
          </ModalOverlay>
        )}

        {/* Edit Service Modal */}
        {showEditModal && (
          <ModalOverlay onClick={() => setShowEditModal(false)}>
            <Modal onClick={(e) => e.stopPropagation()}>
              <ModalHeader>
                <ModalTitle>Edit Service</ModalTitle>
                <CloseButton onClick={() => setShowEditModal(false)}>
                  <FontAwesomeIcon icon={faTimes} />
                </CloseButton>
              </ModalHeader>

              <ModalBody>
                <FormGroup>
                  <Label>Service Name *</Label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., General Consultation"
                    required
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Category *</Label>
                  <Select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {categories.filter(cat => cat !== "all").map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                </FormGroup>

                <FormGroup>
                  <Label>Price (₱) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                    placeholder="e.g., 30"
                  />
                </FormGroup>

                <FormGroup>
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe the service and what it includes..."
                  />
                </FormGroup>
              </ModalBody>

              <ModalActions>
                <SecondaryButton onClick={() => setShowEditModal(false)}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton onClick={handleUpdateService}>
                  <FontAwesomeIcon icon={faSave} />
                  Update Service
                </PrimaryButton>
              </ModalActions>
            </Modal>
          </ModalOverlay>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <ModalOverlay onClick={cancelDeleteService}>
            <Modal onClick={(e) => e.stopPropagation()}>
              <ModalHeader>
                <ModalTitle>Delete Service</ModalTitle>
                <CloseButton onClick={cancelDeleteService}>
                  <FontAwesomeIcon icon={faTimes} />
                </CloseButton>
              </ModalHeader>

              <ModalBody>
                <p>Are you sure you want to delete this service? This action cannot be undone.</p>
              </ModalBody>

              <ModalActions>
                <SecondaryButton onClick={cancelDeleteService}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton onClick={confirmDeleteService} style={{ background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)' }}>
                  <FontAwesomeIcon icon={faTrash} />
                  Delete Service
                </PrimaryButton>
              </ModalActions>
            </Modal>
          </ModalOverlay>
        )}
      </PageContainer>
    </>
  );
};

export default VetServices;