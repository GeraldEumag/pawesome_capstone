/**
 * Secure File Access Utility
 * 
 * This utility provides secure access to files that require authentication.
 * It fetches files using the Bearer token and converts them to blob URLs
 * for safe display in img tags or other components.
 */

class SecureFileAccess {
  constructor() {
    this.blobCache = new Map();
    this.loadingPromises = new Map();
  }

  /**
   * Get a secure file URL as a blob URL
   * @param {string} fileUrl - The secure file endpoint URL
   * @returns {Promise<string>} - Blob URL that can be used in img src
   */
  async getSecureFileUrl(fileUrl) {
    if (!fileUrl) {
      return null;
    }

    // Check cache first
    if (this.blobCache.has(fileUrl)) {
      return this.blobCache.get(fileUrl);
    }

    // Check if already loading
    if (this.loadingPromises.has(fileUrl)) {
      return this.loadingPromises.get(fileUrl);
    }

    // Create loading promise
    const loadingPromise = this.fetchSecureFile(fileUrl);
    this.loadingPromises.set(fileUrl, loadingPromise);

    try {
      const blobUrl = await loadingPromise;
      this.blobCache.set(fileUrl, blobUrl);
      return blobUrl;
    } finally {
      this.loadingPromises.delete(fileUrl);
    }
  }

  /**
   * Fetch a secure file and convert to blob URL
   * @param {string} fileUrl - The secure file endpoint URL
   * @returns {Promise<string>} - Blob URL
   */
  async fetchSecureFile(fileUrl) {
    try {
      const token = this.getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(fileUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'image/*, application/pdf'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      return blobUrl;
    } catch (error) {
      console.error('Secure file access error:', error);
      throw error;
    }
  }

  /**
   * Get authentication token
   * @returns {string|null} - Authentication token
   */
  getAuthToken() {
    return getToken();
  }

  /**
   * Revoke a blob URL to free memory
   * @param {string} blobUrl - The blob URL to revoke
   */
  revokeBlobUrl(blobUrl) {
    if (blobUrl && blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl);
      
      // Remove from cache
      for (const [fileUrl, cachedBlobUrl] of this.blobCache.entries()) {
        if (cachedBlobUrl === blobUrl) {
          this.blobCache.delete(fileUrl);
          break;
        }
      }
    }
  }

  /**
   * Clear all cached blob URLs
   */
  clearCache() {
    // Revoke all blob URLs
    for (const blobUrl of this.blobCache.values()) {
      this.revokeBlobUrl(blobUrl);
    }
    this.blobCache.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get profile photo URL securely
   * @param {string} profilePhotoUrl - The profile photo URL from API response
   * @returns {Promise<string|null>} - Secure blob URL
   */
  async getProfilePhotoUrl(profilePhotoUrl) {
    if (!profilePhotoUrl) {
      return null;
    }

    // If it's already a secure API endpoint, use secure access
    if (profilePhotoUrl.includes('/api/files/profile-photos/')) {
      return this.getSecureFileUrl(profilePhotoUrl);
    }

    // If it's a direct storage URL (legacy), return as-is
    // This maintains backward compatibility
    return profilePhotoUrl;
  }

  /**
   * Get payment proof URL securely
   * @param {string} paymentProofUrl - The payment proof URL
   * @returns {Promise<string|null>} - Secure blob URL
   */
  async getPaymentProofUrl(paymentProofUrl) {
    if (!paymentProofUrl) {
      return null;
    }

    // If it's already a secure API endpoint, use secure access
    if (paymentProofUrl.includes('/api/files/payment-proofs/')) {
      return this.getSecureFileUrl(paymentProofUrl);
    }

    // If it's a direct storage URL (legacy), return as-is
    // This maintains backward compatibility
    return paymentProofUrl;
  }
}

// Create singleton instance
const secureFileAccess = new SecureFileAccess();

// Export utility functions
export const getSecureFileUrl = (fileUrl) => secureFileAccess.getSecureFileUrl(fileUrl);
export const getProfilePhotoUrl = (profilePhotoUrl) => secureFileAccess.getProfilePhotoUrl(profilePhotoUrl);
export const getPaymentProofUrl = (paymentProofUrl) => secureFileAccess.getPaymentProofUrl(paymentProofUrl);
export const revokeBlobUrl = (blobUrl) => secureFileAccess.revokeBlobUrl(blobUrl);
export const clearSecureFileCache = () => secureFileAccess.clearCache();

// Export the class for advanced usage
export default secureFileAccess;
