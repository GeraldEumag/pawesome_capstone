import { useState, useEffect, useCallback } from "react";
import { fetchLandingPageContent } from "../api/landingPage";

const CACHE_KEY = "pawesome_landing_page_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCached = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
};

const setCached = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // ignore
  }
};

export const useLandingPageContent = () => {
  const [content, setContent] = useState(() => getCached() || {});
  const [loading, setLoading] = useState(!getCached());
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLandingPageContent();
      if (res.success && res.data) {
        setContent(res.data);
        setCached(res.data);
      } else {
        setError(res.message || "Failed to load landing page content.");
      }
    } catch (err) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getCached()) {
      refetch();
    }
  }, [refetch]);

  const getSection = useCallback(
    (key, fallback = null) => {
      return content?.[key] ?? fallback;
    },
    [content]
  );

  return { content, loading, error, getSection, refetch };
};
