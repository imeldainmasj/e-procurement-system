import { z } from 'zod';
import {
  booleanQuerySchema,
  codeSchema,
  listQuerySchema,
  optionalText,
  requiredText,
} from './common.schema.js';

export const warehouseInputSchema = z.object({
  code: codeSchema,
  name: requiredText('Nama gudang', 100),
  location: optionalText(255),
  isActive: z.boolean().default(true),
});
export type WarehouseInput = z.input<typeof warehouseInputSchema>;
export type WarehousePayload = z.output<typeof warehouseInputSchema>;

export const warehouseListQuerySchema = listQuerySchema.extend({
  isActive: booleanQuerySchema.optional(),
});

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  location: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
