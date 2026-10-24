import { z } from 'zod';
import {
  booleanQuerySchema,
  codeSchema,
  listQuerySchema,
  optionalText,
  requiredText,
  uuidSchema,
} from './common.schema.js';

// ─── Kategori ────────────────────────────────────────────────────────────────

export const itemCategoryInputSchema = z.object({
  code: codeSchema,
  name: requiredText('Nama kategori', 100),
  description: optionalText(500),
});
export type ItemCategoryInput = z.input<typeof itemCategoryInputSchema>;
export type ItemCategoryPayload = z.output<typeof itemCategoryInputSchema>;

export const itemCategoryListQuerySchema = listQuerySchema;

export interface ItemCategoryDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Item ────────────────────────────────────────────────────────────────────

export const itemSpecsSchema = z
  .record(z.string().trim().min(1).max(50), z.string().trim().max(200))
  .default({});

export const itemInputSchema = z.object({
  code: codeSchema,
  name: requiredText('Nama item', 150),
  categoryId: uuidSchema,
  unit: requiredText('Satuan', 20),
  isAsset: z.boolean().default(false),
  minStock: z.coerce
    .number({ message: 'Stok minimum harus berupa angka' })
    .int({ message: 'Stok minimum harus bilangan bulat' })
    .min(0, { message: 'Stok minimum tidak boleh negatif' })
    .default(0),
  specs: itemSpecsSchema,
  description: optionalText(1000),
});
export type ItemInput = z.input<typeof itemInputSchema>;
export type ItemPayload = z.output<typeof itemInputSchema>;

export const itemListQuerySchema = listQuerySchema.extend({
  categoryId: uuidSchema.optional(),
  isAsset: booleanQuerySchema.optional(),
});

export interface ItemDto {
  id: string;
  code: string;
  name: string;
  unit: string;
  isAsset: boolean;
  minStock: number;
  specs: Record<string, string>;
  description: string | null;
  category: { id: string; code: string; name: string };
  createdAt: string;
  updatedAt: string;
}
