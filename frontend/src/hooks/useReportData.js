/**
 * useReportData Hook
 * Shared hook for fetching real report data from backend API
 * Features: Auto-refresh, caching, retry logic, request deduplication
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '../api/client';

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Generic hook for fetching report data
 * @param {string} endpoint - API endpoint
 * @param {object} params - Query parameters
 * @param {number} refreshInterval - Auto-refresh interval in ms (0 to disable)
 * @param {boolean} enableCache - Enable response caching
 */
export const useReportData = (endpoint, params = {}, refreshInterval = 0, enableCache = true) => {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Track pending requests to prevent duplicates
  const pendingRequest = useRef(null);
  
  // Generate cache key
  const cacheKey = `${endpoint}:${JSON.stringify(params)}`;

  const fetchData = useCallback(async (silent = false, forceRefresh = false) => {
    // Check cache first
    if (enableCache && !forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setData(cached.data);
        setLastUpdated(new Date(cached.timestamp));
        setLoading(false);
        return;
      }
    }
    
    // Prevent duplicate concurrent requests
    if (pendingRequest.current) {
      return pendingRequest.current;
    }
    
    if (!silent) setLoading(true);
    setError(null);
    
    const requestPromise = (async () => {
      try {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            queryParams.append(key, value);
          }
        });
        
        const url = queryParams.toString() ? `${endpoint}?${queryParams}` : endpoint;
        const response = await apiRequest(url);
        
        if (response?.success) {
          const responseData = response.data || {};
          setData(responseData);
          setLastUpdated(new Date());
          setRetryCount(0);
          
          // Update cache
          if (enableCache) {
            cache.set(cacheKey, { data: responseData, timestamp: Date.now() });
          }
          
          return responseData;
        } else {
          throw new Error(response?.message || 'Failed to fetch data');
        }
      } catch (err) {
        console.error(`API Error [${endpoint}]:`, err);
        setError(err.message || 'Network error. Please check your connection.');
        throw err;
      } finally {
        if (!silent) setLoading(false);
        pendingRequest.current = null;
      }
    })();
    
    pendingRequest.current = requestPromise;
    return requestPromise;
  }, [endpoint, JSON.stringify(params), enableCache, cacheKey]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh with exponential backoff on errors
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchData(true).catch(() => {
          // On error, increase retry delay
          setRetryCount(prev => Math.min(prev + 1, 5));
        });
      }, refreshInterval * Math.pow(2, retryCount));
      
      return () => clearInterval(interval);
    }
  }, [refreshInterval, fetchData, retryCount]);
  
  // Clear cache for this endpoint
  const clearCache = useCallback(() => {
    cache.delete(cacheKey);
  }, [cacheKey]);
  
  // Force refresh
  const refresh = useCallback(() => {
    clearCache();
    return fetchData(false, true);
  }, [clearCache, fetchData]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refetch: refresh,
    clearCache,
  };
};

/**
 * Hook specifically for executive dashboard
 */
export const useExecutiveData = (timeRange = 'today') => {
  const params = {};
  const today = new Date().toISOString().split('T')[0];
  
  if (timeRange === 'today') {
    params.from = today;
    params.to = today;
  } else if (timeRange === 'week') {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    params.from = weekAgo;
    params.to = today;
  } else if (timeRange === 'month') {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    params.from = monthAgo;
    params.to = today;
  }
  
  return useReportData('/admin/reports/executive', params, 30000); // 30s refresh
};

/**
 * Hook for predictive analytics
 */
export const usePredictiveData = (metric = 'revenue', forecastDays = 30) => {
  return useReportData('/admin/reports/predictive', {
    metric,
    forecast_days: forecastDays,
  }, 60000); // 60s refresh
};

/**
 * Hook for customer segmentation
 */
export const useSegmentationData = (recencyDays = 90) => {
  return useReportData('/admin/reports/customers/segments', {
    recency_days: recencyDays,
  }, 300000); // 5min refresh
};

/**
 * Hook for comparative reporting
 */
export const useComparativeData = (primaryPeriod = 'month', comparisonPeriod = 'last_month') => {
  return useReportData('/admin/reports/comparison', {
    primary_period: primaryPeriod,
    comparison_period: comparisonPeriod,
  }, 60000); // 60s refresh
};

/**
 * Hook for sales analysis
 */
export const useSalesData = (timeRange = 'month', compareTo = 'last_period') => {
  return useReportData('/admin/reports/sales-analysis', {
    range: timeRange,
    compare: compareTo,
  }, 30000); // 30s refresh
};

/**
 * Hook for inventory optimization
 */
export const useInventoryOptData = () => {
  return useReportData('/admin/reports/inventory-opt', {}, 300000); // 5min refresh
};

/**
 * Hook for staff performance
 */
export const useStaffPerformanceData = (timeRange = 'month') => {
  return useReportData('/admin/reports/staff-performance', {
    range: timeRange,
  }, 300000); // 5min refresh
};

/**
 * Hook for alerts
 */
export const useAlertsData = () => {
  return useReportData('/admin/reports/alerts', {}, 60000); // 60s refresh
};

export default useReportData;
