import { Component } from "react";
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // In production, you could send this to an error tracking service
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.error("ErrorBoundary caught:", error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const { error } = this.state;

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "var(--bg-primary, #f8f9fa)",
          }}
        >
          <div
            style={{
              maxWidth: "560px",
              width: "100%",
              background: "var(--card-bg, #fff)",
              borderRadius: "16px",
              padding: "40px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "#fee2e2",
                color: "#dc2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                margin: "0 auto 20px",
              }}
            >
              ⚠
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 600 }}>
              Something went wrong
            </h2>
            <p
              style={{
                margin: "0 0 24px",
                color: "var(--text-secondary, #6b7280)",
                lineHeight: 1.6,
              }}
            >
              We&apos;re sorry, but an unexpected error occurred. Our team has been
              notified. You can try refreshing the page or go back to the
              dashboard.
            </p>

            {import.meta.env?.DEV && error && (
              <details
                style={{
                  marginBottom: "24px",
                  textAlign: "left",
                  background: "#f3f4f6",
                  borderRadius: "8px",
                  padding: "16px",
                  fontSize: "13px",
                  overflow: "auto",
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 500 }}>
                  Error details
                </summary>
                <pre
                  style={{
                    marginTop: "12px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {error.toString()}
                  {"\n"}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Refresh Page
              </button>
              <a
                href="/"
                onClick={this.handleReset}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "transparent",
                  color: "var(--text-primary, #374151)",
                  fontSize: "14px",
                  fontWeight: 500,
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                Go to Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
