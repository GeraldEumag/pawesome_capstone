import { apiRequest } from "./client";

export const notificationApi = {
  // Get notifications for the authenticated user (server scopes by token).
  // Optional params: { unread: boolean, limit: number }
  getAll: async ({ unread = false, limit } = {}) => {
    const params = new URLSearchParams();
    if (unread) params.set("unread", "1");
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return apiRequest(`/notifications${qs ? `?${qs}` : ""}`);
  },

  // Get unread notifications
  getUnread: async () => {
    return apiRequest("/notifications/unread");
  },

  // Get unread count only
  getUnreadCount: async () => {
    return apiRequest("/notifications/unread-count");
  },

  // Create notification (admin use)
  createNotification: async (notificationData) => {
    return apiRequest("/notifications", {
      method: "POST",
      body: JSON.stringify(notificationData),
    });
  },

  // Mark single notification as read
  markAsRead: async (id) => {
    return apiRequest(`/notifications/${id}/read`, {
      method: "POST",
    });
  },

  // Mark all as read
  markAllAsRead: async () => {
    return apiRequest("/notifications/mark-all-read", {
      method: "POST",
    });
  },

  // Clear all notifications
  clearAll: async () => {
    return apiRequest("/notifications/clear-all", {
      method: "POST",
    });
  },

  // Delete single notification
  deleteNotification: async (id) => {
    return apiRequest(`/notifications/${id}`, {
      method: "DELETE",
    });
  },
};
