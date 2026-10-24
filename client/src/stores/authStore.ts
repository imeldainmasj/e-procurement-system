import { create } from 'zustand';
import type { AuthSession, AuthUser } from '@sipita/shared';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  /** Kept in memory only; the session survives reloads through the httpOnly refresh cookie. */
  accessToken: string | null;
  user: AuthUser | null;
  setLoading: () => void;
  setSession: (session: AuthSession) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'idle',
  accessToken: null,
  user: null,
  setLoading: () => set({ status: 'loading' }),
  setSession: ({ accessToken, user }) => set({ status: 'authenticated', accessToken, user }),
  clear: () => set({ status: 'unauthenticated', accessToken: null, user: null }),
}));
