import { useEffect } from "react";
import "./App.css";
import "./styles/dashboardGlobal.css";
import AppRoutes from "./routes/AppRoutes";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import { fetchAndApplySystemTheme } from "./utils/theme";

function App() {
  useEffect(() => {
    fetchAndApplySystemTheme();
  }, []);

  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  );
}

export default App;