import React from 'react';
import './ReportSkeleton.css';

/**
 * ReportSkeleton - Loading placeholder for reports
 * Better UX than spinner - shows content structure while loading
 */

const SkeletonCard = () => (
  <div className="skeleton-card">
    <div className="skeleton-icon" />
    <div className="skeleton-content">
      <div className="skeleton-title" />
      <div className="skeleton-value" />
    </div>
  </div>
);

const SkeletonChart = () => (
  <div className="skeleton-chart">
    <div className="skeleton-chart-header">
      <div className="skeleton-text short" />
    </div>
    <div className="skeleton-chart-body">
      <div className="skeleton-bars">
        {[...Array(7)].map((_, i) => (
          <div 
            key={i} 
            className="skeleton-bar" 
            style={{ height: `${Math.random() * 60 + 20}%` }}
          />
        ))}
      </div>
    </div>
  </div>
);

const SkeletonTable = () => (
  <div className="skeleton-table">
    <div className="skeleton-table-header">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="skeleton-cell" />
      ))}
    </div>
    {[...Array(5)].map((_, rowIndex) => (
      <div key={rowIndex} className="skeleton-table-row">
        {[...Array(5)].map((__, cellIndex) => (
          <div key={cellIndex} className="skeleton-cell" />
        ))}
      </div>
    ))}
  </div>
);

const ReportSkeleton = ({ type = 'full' }) => {
  return (
    <div className="report-skeleton">
      {/* Header Skeleton */}
      <div className="skeleton-section">
        <div className="skeleton-header">
          <div className="skeleton-title-main" />
          <div className="skeleton-subtitle" />
        </div>
      </div>

      {/* KPI Cards Skeleton */}
      {type !== 'minimal' && (
        <div className="skeleton-section">
          <div className="skeleton-grid">
            {[...Array(4)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Charts Skeleton */}
      {type !== 'minimal' && (
        <div className="skeleton-section">
          <div className="skeleton-charts-grid">
            <SkeletonChart />
            <SkeletonChart />
          </div>
        </div>
      )}

      {/* Table Skeleton */}
      {type === 'full' && (
        <div className="skeleton-section">
          <SkeletonTable />
        </div>
      )}

      {/* Shimmer Animation */}
      <div className="skeleton-shimmer" />
    </div>
  );
};

export default ReportSkeleton;
