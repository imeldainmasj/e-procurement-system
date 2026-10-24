import { z } from 'zod';
import type { PermissionMap } from '../access.js';
import { FEATURES, JOB_LEVELS, type JobLevel } from '../enums.js';
import {
  booleanQuerySchema,
  listQuerySchema,
  optionalUuid,
  requiredText,
  uuidSchema,
} from './common.schema.js';

export const passwordSchema = z
  .string({ message: 'Password wajib diisi' })
  .min(8, { message: 'Password minimal 8 karakter' })
  .max(72, { message: 'Password maksimal 72 karakter' })
  .regex(/[A-Za-z]/, { message: 'Password harus mengandung huruf' })
  .regex(/\d/, { message: 'Password harus mengandung angka' });

/** Lowercase login name, e.g. "andi.pratama" (used by the import template's PIC column). */
export const usernameSchema = z
  .string({ message: 'Username wajib diisi' })
  .trim()
  .toLowerCase()
  .min(3, { message: 'Username minimal 3 karakter' })
  .max(50, { message: 'Username maksimal 50 karakter' })
  .regex(/^[a-z0-9][a-z0-9._-]*$/, {
    message: 'Username hanya boleh huruf kecil, angka, titik, - dan _',
  });

const permissionFlagsSchema = z.object({
  view: z.boolean(),
  create: z.boolean(),
  update: z.boolean(),
  delete: z.boolean(),
});

export const permissionMapSchema = z.object(
  Object.fromEntries(FEATURES.map((f) => [f, permissionFlagsSchema])) as Record<
    (typeof FEATURES)[number],
    typeof permissionFlagsSchema
  >,
);

const userBaseSchema = z.object({
  employeeId: requiredText('NIK karyawan', 30),
  username: usernameSchema,
  name: requiredText('Nama', 100),
  email: z
    .string({ message: 'Email wajib diisi' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Format email tidak valid' })),
  jobLevel: z.enum(JOB_LEVELS, { message: 'Jabatan wajib dipilih' }),
  departmentId: optionalUuid,
  isAdmin: z.boolean().default(false),
  isActive: z.boolean().default(true),
  permissions: permissionMapSchema,
});

export const userCreateSchema = userBaseSchema.extend({ password: passwordSchema });
export type UserCreateInput = z.input<typeof userCreateSchema>;
export type UserCreatePayload = z.output<typeof userCreateSchema>;

export const userUpdateSchema = userBaseSchema;
export type UserUpdateInput = z.input<typeof userUpdateSchema>;
export type UserUpdatePayload = z.output<typeof userUpdateSchema>;

export const resetPasswordSchema = z.object({ password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const userListQuerySchema = listQuerySchema.extend({
  jobLevel: z.enum(JOB_LEVELS).optional(),
  departmentId: uuidSchema.optional(),
  isActive: booleanQuerySchema.optional(),
});

export interface UserDto {
  id: string;
  employeeId: string;
  username: string;
  name: string;
  email: string;
  jobLevel: JobLevel;
  isAdmin: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  department: { id: string; code: string; name: string } | null;
  permissions: PermissionMap;
  createdAt: string;
  updatedAt: string;
}

/** Compact user for pickers (PIC, filters). */
export interface UserOptionDto {
  id: string;
  name: string;
  username: string;
  jobLevel: JobLevel;
}
