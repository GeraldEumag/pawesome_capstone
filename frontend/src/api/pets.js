import { apiRequest } from "./client";

export const petsApi = {
  getPets: async () => {
    return apiRequest("/pets");
  },

  getPet: async (id) => {
    return apiRequest(`/pets/${id}`);
  },

  createPet: async (data) => {
    const isFormData = data instanceof FormData;
    return apiRequest("/pets", {
      method: "POST",
      body: isFormData ? data : JSON.stringify(data),
      ...(isFormData ? {} : { headers: { "Content-Type": "application/json" } }),
    });
  },

  updatePet: async (id, data) => {
    const isFormData = data instanceof FormData;
    return apiRequest(`/pets/${id}`, {
      method: "PUT",
      body: isFormData ? data : JSON.stringify(data),
      ...(isFormData ? {} : { headers: { "Content-Type": "application/json" } }),
    });
  },

  deletePet: async (id) => {
    return apiRequest(`/pets/${id}`, {
      method: "DELETE",
    });
  },
};
