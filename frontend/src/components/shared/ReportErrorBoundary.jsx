import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faRedo } from '@fortawesome/free-solid-svg-icons';
import './ReportErrorBoundary.css';

/**
 * ReportErrorBoundary - Catches errors in report components
 * Prevents entire app crash when a report fails
 */

class ReportErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    
    // Log to error tracking service
    console.error('Report Error Boundary caught an error:', error, errorInfo);
    
    // Could send to analytics/logging service here
    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: `Report Error: ${error.message}`,
        fatal: false,
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    
    // Call onRetry prop if provided
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="report-error-boundary">
          <div className="error-container">
            <FontAwesomeIcon icon={faExclamationTriangle} className="error-icon" />
            <h3>Something went wrong</h3>
            <p>We encountered an error while loading this report.</p>
            
            {import.meta.env?.DEV && this.state.error && (
              <details className="error-details">
                <summary>Error Details (Development Only)</summary>
                <pre>{this.state.error.toString()}</pre>
                <pre>{this.state.errorInfo?.componentStack}</pre>
              </details>
            )}
            
            <div className="error-actions">
              <button 
                className="retry-btn"
                onClick={this.handleRetry}
              >
                <FontAwesomeIcon icon={faRedo} />
                Try Again
              </button>
              
              {this.props.fallbackAction && (
                <button 
                  className="fallback-btn"
                  onClick={this.props.fallbackAction}
                >
                  {this.props.fallbackLabel || 'Go Back'}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ReportErrorBoundary;
