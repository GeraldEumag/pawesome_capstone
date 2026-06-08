import { useState, useEffect, useRef } from 'react';
import { secureFileAccess } from '../utils/secureFileAccess.jsx';

/**
 * React hook for secure file access
 * @param {string} fileUrl - The file URL
 * @returns {Object} - { url: string | null, loading: boolean, error: string | null }
 */
export const useSecureFile = (fileUrl) => {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const urlRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadFile = async () => {
      if (!fileUrl) {
        setUrl(null);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const secureUrl = await secureFileAccess.getSecureFileUrl(fileUrl);
        if (isMounted) {
          // Revoke previous URL if exists
          if (urlRef.current) {
            secureFileAccess.revokeBlobUrl(urlRef.current);
          }
          urlRef.current = secureUrl;
          setUrl(secureUrl);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setUrl(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadFile();

    return () => {
      isMounted = false;
      // Cleanup blob URL when component unmounts
      if (urlRef.current) {
        secureFileAccess.revokeBlobUrl(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [fileUrl]);

  return { url, loading, error };
};

/**
 * React hook specifically for profile photos
 * @param {string} profilePhotoUrl - The profile photo URL
 * @returns {Object} - { url: string | null, loading: boolean, error: string | null }
 */
export const useProfilePhoto = (profilePhotoUrl) => {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const urlRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadProfilePhoto = async () => {
      if (!profilePhotoUrl) {
        setUrl(null);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const secureUrl = await secureFileAccess.getProfilePhotoUrl(profilePhotoUrl);
        if (isMounted) {
          // Revoke previous URL if exists
          if (urlRef.current) {
            secureFileAccess.revokeBlobUrl(urlRef.current);
          }
          urlRef.current = secureUrl;
          setUrl(secureUrl);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setUrl(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadProfilePhoto();

    return () => {
      isMounted = false;
      // Cleanup blob URL when component unmounts
      if (urlRef.current) {
        secureFileAccess.revokeBlobUrl(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [profilePhotoUrl]);

  return { url, loading, error };
};

/**
 * React hook specifically for payment proofs
 * @param {string} paymentProofUrl - The payment proof URL
 * @returns {Object} - { url: string | null, loading: boolean, error: string | null }
 */
export const usePaymentProof = (paymentProofUrl) => {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const urlRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadPaymentProof = async () => {
      if (!paymentProofUrl) {
        setUrl(null);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const secureUrl = await secureFileAccess.getPaymentProofUrl(paymentProofUrl);
        if (isMounted) {
          // Revoke previous URL if exists
          if (urlRef.current) {
            secureFileAccess.revokeBlobUrl(urlRef.current);
          }
          urlRef.current = secureUrl;
          setUrl(secureUrl);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setUrl(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadPaymentProof();

    return () => {
      isMounted = false;
      // Cleanup blob URL when component unmounts
      if (urlRef.current) {
        secureFileAccess.revokeBlobUrl(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [paymentProofUrl]);

  return { url, loading, error };
};
