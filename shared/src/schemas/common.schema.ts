import { z } from 'zod';

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

export const uuidSchema = z.uuid({ message: 'ID tidak valid' });

export const idParamSchema = z.object({ id: uuidSchema });
export type IdParam = z.infer<typeof idParamSchema>;

/** `sort` query format: `field:asc` or `field:desc`. */
export const sortSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_.]+:(asc|desc)$/, { message: 'Format sort harus field:asc atau field:desc' });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1, { message: 'Halaman minimal 1' }).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, { message: 'Limit minimal 1' })
    .max(PAGINATION_MAX_LIMIT, { message: `Limit maksimal ${PAGINATION_MAX_LIMIT}` })
    .default(PAGINATION_DEFAULT_LIMIT),
  search: z.string().trim().min(1).optional(),
  sort: sortSchema.optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Query-string boolean: "true" | "false". */
export const booleanQuerySchema = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Master-data code: uppercase letters, digits, "-" and "_". */
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, { message: 'Kode wajib diisi' })
  .max(30, { message: 'Kode maksimal 30 karakter' })
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/, { message: 'Kode hanya boleh berisi huruf, angka, - dan _' });

export const requiredText = (label: string, max = 255) =>
  z
    .string({ message: `${label} wajib diisi` })
    .trim()
    .min(1, { message: `${label} wajib diisi` })
    .max(max, { message: `${label} maksimal ${max} karakter` });

/** Optional free text; empty strings become null. */
export const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max, { message: `Maksimal ${max} karakter` })
    .nullish()
    .transform((v) => (v ? v : null));

/** Optional UUID reference; empty strings become null. */
export const optionalUuid = z
  .union([z.literal(''), uuidSchema])
  .nullish()
  .transform((v) => (v ? v : null));
