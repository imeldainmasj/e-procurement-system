import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { LoginInput } from '@sipita/shared';
import * as authApi from '@/api/auth.api';
import { useAuthStore } from '@/stores/authStore';

export function useAuth() {
  const { status, user } = useAuthStore();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (session) => useAuthStore.getState().setSession(session),
  });

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      useAuthStore.getState().clear();
      queryClient.clear();
    }
  }, [queryClient]);

  return { status, user, isAuthenticated: status === 'authenticated', loginMutation, logout };
}

/** Restores the session from the refresh cookie once per page load. */
export async function bootstrapSession(): Promise<void> {
  const store = useAuthStore.getState();
  if (store.status !== 'idle') return;
  store.setLoading();
  try {
    store.setSession(await authApi.refreshSession());
  } catch {
    store.clear();
  }
}
