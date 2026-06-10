import { apiRequest } from "./client";

export const fetchLandingPageContent = async () => {
  const data = await apiRequest("/landing-page");
  return data;
};

export const fetchAdminLandingPageSections = async () => {
  const data = await apiRequest("/admin/landing-page");
  return data;
};

export const fetchAdminLandingPageSection = async (section) => {
  const data = await apiRequest(`/admin/landing-page/${section}`);
  return data;
};

export const updateLandingPageSection = async (section, contentData, isActive = true) => {
  const data = await apiRequest(`/admin/landing-page/${section}`, {
    method: "PUT",
    body: JSON.stringify({ content_data: contentData, is_active: isActive }),
  });
  return data;
};

export const uploadLandingPageImage = async (file, section) => {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("section", section);

  const data = await apiRequest("/admin/landing-page/upload-image", {
    method: "POST",
    body: formData,
  });
  return data;
};
