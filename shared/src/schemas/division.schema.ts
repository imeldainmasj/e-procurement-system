import { z } from 'zod';
import { codeSchema, listQuerySchema, optionalUuid, requiredText } from './common.schema.js';

export const divisionInputSchema = z.object({
  code: codeSchema,
  name: requiredText('Nama divisi', 100),
  headUserId: optionalUuid,
});
export type DivisionInput = z.input<typeof divisionInputSchema>;
export type DivisionPayload = z.output<typeof divisionInputSchema>;

export const divisionListQuerySchema = listQuerySchema;

export interface DivisionDto {
  id: string;
  code: string;
  name: string;
  headUser: { id: string; name: string } | null;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}
