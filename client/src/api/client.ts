import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorBody, ApiSuccess, AuthSession } from '@sipita/shared';
import { useAuthStore } from '@/stores/authStore';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

/** Central axios instance: attaches the bearer token and transparently refreshes it on 401. */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // send the httpOnly refresh-token cookie
  timeout: 30_000,
});

const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/logout'];
const isAuthEndpoint = (url?: string) => AUTH_ENDPOINTS.some((path) => url?.endsWith(path));

async function postRefresh(): Promise<AuthSession> {
  const res = await api.post<ApiSuccess<AuthSession>>('/auth/refresh');
  return res.data.data;
}

let refreshPromise: Promise<AuthSession> | null = null;

/**
 * Exchanges the refresh cookie for a new session. Concurrent callers share one request,
 * because the server rotates the token and a second parallel refresh would be rejected.
 */
export function refreshSession(): Promise<AuthSession> {
  refreshPromise ??= (async () => {
    try {
      return await postRefresh();
    } catch (err) {
      // Another tab may have rotated the cookie a moment ago; retry once with the new one.
      if (err instanceof AxiosError && err.response?.status === 401) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return postRefresh();
      }
      throw err;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token && !config.headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!(error instanceof AxiosError)) throw error;
  const original: InternalAxiosRequestConfig | undefined = error.config;
  if (
    error.response?.status !== 401 ||
    !original ||
    original._retry ||
    isAuthEndpoint(original.url)
  ) {
    throw error;
  }

  original._retry = true;
  try {
    const session = await refreshSession();
    useAuthStore.getState().setSession(session);
    original.headers.set('Authorization', `Bearer ${session.accessToken}`);
    return await api(original);
  } catch {
    // Refresh failed: drop the session; route guards redirect to /login.
    useAuthStore.getState().clear();
    throw error;
  }
});

/** Extracts the Indonesian error message from an API error response. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined;
    if (body?.error?.message) return body.error.message;
    if (!error.response) return 'Tidak dapat terhubung ke server';
  }
  return 'Terjadi kesalahan yang tidak terduga';
}
