import type { ApiSuccess, AuthSession, AuthUser, LoginInput } from '@sipita/shared';
import { api } from './client';

export { refreshSession } from './client';

export async function login(input: LoginInput): Promise<AuthSession> {
  const res = await api.post<ApiSuccess<AuthSession>>('/auth/login', input);
  return res.data.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function getMe(): Promise<AuthUser> {
  const res = await api.get<ApiSuccess<AuthUser>>('/auth/me');
  return res.data.data;
}
