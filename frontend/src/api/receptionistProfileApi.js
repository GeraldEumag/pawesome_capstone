import { apiRequest } from "./client";

async function request(endpoint, options = {}) {
  return apiRequest(endpoint, options);
}

export const receptionistProfileApi = {
  getCustomers: () => request("/receptionist/customers"),
  getPets: () => request("/receptionist/pets"),

  createCustomer: (payload) =>
    request("/receptionist/customers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateCustomer: (id, payload) =>
    request(`/receptionist/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteCustomer: (id, reason) =>
    request(`/receptionist/customers/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    }),

  createPet: (payload) =>
    request("/receptionist/pets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updatePet: (id, payload) =>
    request(`/pets/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deletePet: (id, reason) =>
    request(`/pets/${id}/archive`, {
      method: "POST",
      body: JSON.stringify({ archive_reason: reason }),
    }),
};
