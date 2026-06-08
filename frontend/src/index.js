import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import './index.css';
import './styles/globalTheme.css';
import './styles/dashboard.css';
import './styles/sidebar.css';
import './styles/table.css';
import './styles/modal.css';
import './styles/animation.css';
import './styles/responsive.css';
import './styles/unifiedDashboard.css';
import './styles/unifiedSidebar.css';
import './styles/unifiedReports.css';
import './styles/theme.css';
import './styles/sweetalert-theme.css';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
      <Toaster
        position="top-center"
        containerStyle={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 99999,
          width: "min(460px, calc(100vw - 24px))",
        }}
      />
    </AuthProvider>
  </React.StrictMode>
);

reportWebVitals();
