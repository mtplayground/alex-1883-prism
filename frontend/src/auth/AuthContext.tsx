import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError } from "../api/client";
import {
  getCurrentUser,
  getPublicConfig,
  registerCurrentUser,
} from "../api/system";
import type { PublicConfigResponse, User } from "../api/types";

type AuthStatus = "loading" | "signed-out" | "signed-in" | "error";

interface AuthContextValue {
  config: PublicConfigResponse | null;
  error: string | null;
  refresh: () => Promise<void>;
  register: () => Promise<void>;
  signIn: () => void;
  status: AuthStatus;
  user: User | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);

  const loadSession = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      const publicConfig = await getPublicConfig();
      setConfig(publicConfig);

      try {
        const response = await getCurrentUser();
        setUser(response.user);
        setStatus("signed-in");
      } catch (sessionError) {
        if (sessionError instanceof ApiError && sessionError.status === 401) {
          setUser(null);
          setStatus("signed-out");
          return;
        }

        throw sessionError;
      }
    } catch (loadError) {
      setUser(null);
      setStatus("error");
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load session.",
      );
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const signIn = useCallback(() => {
    window.location.assign(config?.auth_login_url ?? "/api/auth/login");
  }, [config]);

  const register = useCallback(async () => {
    try {
      const response = await registerCurrentUser();
      setUser(response.user);
      setStatus("signed-in");
      setError(null);
    } catch (registerError) {
      if (registerError instanceof ApiError && registerError.status === 401) {
        signIn();
        return;
      }

      setError(
        registerError instanceof Error
          ? registerError.message
          : "Unable to register.",
      );
      setStatus(user ? "signed-in" : "signed-out");
    }
  }, [signIn, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      config,
      error,
      refresh: loadSession,
      register,
      signIn,
      status,
      user,
    }),
    [config, error, loadSession, register, signIn, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The hook belongs next to the provider so consumers share one context instance.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
