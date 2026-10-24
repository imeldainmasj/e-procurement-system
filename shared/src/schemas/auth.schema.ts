import { z } from 'zod';
import type { Role } from '../enums.js';

export const loginSchema = z.object({
  email: z
    .string({ message: 'Email wajib diisi' })
    .trim()
    .toLowerCase()
    .min(1, { message: 'Email wajib diisi' })
    .pipe(z.email({ message: 'Format email tidak valid' })),
  password: z
    .string({ message: 'Password wajib diisi' })
    .min(1, { message: 'Password wajib diisi' }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  nip: string | null;
  phone: string | null;
  approvalLevel: number | null;
  division: { id: string; code: string; name: string } | null;
  roles: Role[];
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}
