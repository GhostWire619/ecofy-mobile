import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { authApi } from '@/lib/api/mobile';
import {
  clearTokens,
  getStoredTokens,
  getStoredUser,
  persistStoredUser,
  persistTokens,
} from '@/lib/api/client';
import { bootstrapCurrentUser } from '@/lib/bootstrap/bootstrap';
import type { AuthState, UserProfile } from '@/lib/domain/types';
import { clearLocalUserData, saveUserProfile, seedBootstrapDefaults, sessionRepository } from '@/lib/db/repositories';

type AuthContextValue = AuthState & {
  onboardingComplete: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string, preferredLanguage?: 'en' | 'sw') => Promise<void>;
  loginWithApple: (
    identityToken: string,
    fullName?: string | null,
    preferredLanguage?: 'en' | 'sw',
  ) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    full_name: string;
    phone_number?: string;
    location?: string;
    preferred_language: 'en' | 'sw';
  }) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  markOnboardingComplete: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function hydrateBootstrap(user: UserProfile) {
  try {
    await bootstrapCurrentUser();
  } catch {
    await saveUserProfile(user);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isReady: false,
    isAuthenticated: false,
    user: null,
  });
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        await seedBootstrapDefaults();
        const [tokens, storedUser] = await Promise.all([
          getStoredTokens(),
          getStoredUser(),
        ]);
        const session = await sessionRepository.getSession(storedUser?.id);

        setOnboardingComplete(Boolean(session?.onboarding_complete));
        setAuthState({
          isReady: true,
          isAuthenticated: Boolean(tokens && storedUser),
          user: storedUser,
        });

        if (tokens && storedUser) {
          startTransition(() => {
            void hydrateBootstrap(storedUser);
          });
        }
      } catch {
        setAuthState({ isReady: true, isAuthenticated: false, user: null });
      }
    })();
  }, []);

  const completeSignIn = useCallback(
    async (response: { access_token: string; refresh_token: string; user: UserProfile }) => {
      // If local data belongs to a different account (e.g. a prior login on this
      // device), wipe it so the new user starts clean — no inherited farms or
      // stale onboarding flag, and no cross-account data leakage.
      const priorUserId = await sessionRepository.getOwnerUserId();
      if (priorUserId && priorUserId !== response.user.id) {
        await clearLocalUserData();
      }

      await persistTokens({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
      });
      await persistStoredUser(response.user);
      await saveUserProfile(response.user);
      await bootstrapCurrentUser().catch(async () => {
        await sessionRepository.upsertSession({
          user_id: response.user.id,
          locale: response.user.preferred_language,
          updated_at: new Date().toISOString(),
        });
      });

      const session = await sessionRepository.getSession(response.user.id);
      setOnboardingComplete(Boolean(session?.onboarding_complete));
      setAuthState({ isReady: true, isAuthenticated: true, user: response.user });
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await authApi.login(email, password);
      await completeSignIn(response);
    },
    [completeSignIn],
  );

  const loginWithGoogle = useCallback(
    async (idToken: string, preferredLanguage: 'en' | 'sw' = 'en') => {
      const response = await authApi.googleSignIn(idToken, preferredLanguage);
      await completeSignIn(response);
    },
    [completeSignIn],
  );

  const loginWithApple = useCallback(
    async (identityToken: string, fullName?: string | null, preferredLanguage: 'en' | 'sw' = 'en') => {
      const response = await authApi.appleSignIn(identityToken, fullName, preferredLanguage);
      await completeSignIn(response);
    },
    [completeSignIn],
  );

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      full_name: string;
      phone_number?: string;
      location?: string;
      preferred_language: 'en' | 'sw';
    }) => {
      await authApi.register(input);
      await login(input.email, input.password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    await clearTokens();
    setOnboardingComplete(false);
    setAuthState({
      isReady: true,
      isAuthenticated: false,
      user: null,
    });
  }, []);

  const deleteAccount = useCallback(async () => {
    // Tell the backend to schedule deletion (30-day grace, then purge), then
    // wipe everything local so this device starts clean.
    await authApi.requestAccountDeletion();
    await clearLocalUserData().catch(() => undefined);
    await clearTokens();
    setOnboardingComplete(false);
    setAuthState({ isReady: true, isAuthenticated: false, user: null });
  }, []);

  const refreshBootstrap = useCallback(async () => {
    if (!authState.user) {
      return;
    }

    await bootstrapCurrentUser();
    const session = await sessionRepository.getSession(authState.user.id);
    setOnboardingComplete(Boolean(session?.onboarding_complete));
  }, [authState.user]);

  const markOnboardingComplete = useCallback(async () => {
    if (!authState.user) {
      return;
    }

    await sessionRepository.upsertSession({
      user_id: authState.user.id,
      onboarding_complete: 1,
      updated_at: new Date().toISOString(),
    });
    setOnboardingComplete(true);
  }, [authState.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...authState,
      onboardingComplete,
      login,
      loginWithGoogle,
      loginWithApple,
      register,
      logout,
      deleteAccount,
      refreshBootstrap,
      markOnboardingComplete,
    }),
    [authState, onboardingComplete, login, loginWithGoogle, loginWithApple, register, logout, deleteAccount, refreshBootstrap, markOnboardingComplete],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
