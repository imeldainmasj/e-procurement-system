import { z } from 'zod';
import type { PermissionMap } from '../access.js';
import type { JobLevel } from '../enums.js';

export const loginSchema = z.object({
  /** Username or email. */
  identifier: z
    .string({ message: 'Username atau email wajib diisi' })
    .trim()
    .toLowerCase()
    .min(1, { message: 'Username atau email wajib diisi' }),
  password: z
    .string({ message: 'Password wajib diisi' })
    .min(1, { message: 'Password wajib diisi' }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  employeeId: string;
  username: string;
  name: string;
  email: string;
  jobLevel: JobLevel;
  isAdmin: boolean;
  department: { id: string; code: string; name: string } | null;
  permissions: PermissionMap;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}
