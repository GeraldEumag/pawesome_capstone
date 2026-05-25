import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  getToken,
  getRole,
  getUserData,
  setToken,
  setRole,
  setUserData,
  clearAuth,
  isAuthenticated,
  onAuthChange,
  notifyAuthChange,
} from "../utils/auth";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [state, setState] = useState(() => ({
    token: getToken(),
    role: getRole(),
    user: getUserData(),
    isAuthenticated: isAuthenticated(),
  }));

  const refresh = useCallback(() => {
    setState({
      token: getToken(),
      role: getRole(),
      user: getUserData(),
      isAuthenticated: isAuthenticated(),
    });
  }, []);

  const login = useCallback((token, role, userData = {}) => {
    setToken(token);
    setRole(role);
    setUserData(userData);
    setState({
      token,
      role,
      user: { ...getUserData(), ...userData },
      isAuthenticated: true,
    });
    notifyAuthChange();
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setState({
      token: null,
      role: null,
      user: null,
      isAuthenticated: false,
    });
    notifyAuthChange();
  }, []);

  const updateUser = useCallback((userData) => {
    setUserData(userData);
    refresh();
  }, [refresh]);

  useEffect(() => {
    return onAuthChange(refresh);
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      login,
      logout,
      updateUser,
      refresh,
    }),
    [state, login, logout, updateUser, refresh]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};
