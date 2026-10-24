import { z } from 'zod';
import { ROLES, type Role } from '../enums.js';
import {
  booleanQuerySchema,
  listQuerySchema,
  optionalText,
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

const userBaseSchema = z.object({
  name: requiredText('Nama', 100),
  email: z
    .string({ message: 'Email wajib diisi' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Format email tidak valid' })),
  nip: optionalText(30),
  phone: optionalText(30),
  divisionId: optionalUuid,
  roles: z
    .array(z.enum(ROLES), { message: 'Role wajib dipilih' })
    .min(1, { message: 'Pilih minimal satu role' })
    .refine((roles) => new Set(roles).size === roles.length, {
      message: 'Role tidak boleh duplikat',
    }),
  approvalLevel: z.coerce
    .number()
    .int()
    .min(1, { message: 'Level approval minimal 1' })
    .max(10, { message: 'Level approval maksimal 10' })
    .nullish()
    .transform((v) => v ?? null),
  isActive: z.boolean().default(true),
});

/** APPROVER needs a level; other users never keep one. */
function withApprovalLevelRule<T extends z.ZodType<z.output<typeof userBaseSchema>>>(schema: T) {
  return schema
    .refine((u) => !u.roles.includes('APPROVER') || u.approvalLevel !== null, {
      message: 'Level approval wajib diisi untuk role Approver',
      path: ['approvalLevel'],
    })
    .transform((u) => (u.roles.includes('APPROVER') ? u : { ...u, approvalLevel: null }));
}

export const userCreateSchema = withApprovalLevelRule(
  userBaseSchema.extend({ password: passwordSchema }),
);
export type UserCreateInput = z.input<typeof userCreateSchema>;
export type UserCreatePayload = z.output<typeof userCreateSchema>;

export const userUpdateSchema = withApprovalLevelRule(userBaseSchema);
export type UserUpdateInput = z.input<typeof userUpdateSchema>;
export type UserUpdatePayload = z.output<typeof userUpdateSchema>;

export const resetPasswordSchema = z.object({ password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const userListQuerySchema = listQuerySchema.extend({
  role: z.enum(ROLES).optional(),
  divisionId: uuidSchema.optional(),
  isActive: booleanQuerySchema.optional(),
});

export interface UserDto {
  id: string;
  name: string;
  email: string;
  nip: string | null;
  phone: string | null;
  approvalLevel: number | null;
  isActive: boolean;
  lastLoginAt: string | null;
  division: { id: string; code: string; name: string } | null;
  roles: Role[];
  createdAt: string;
  updatedAt: string;
}
