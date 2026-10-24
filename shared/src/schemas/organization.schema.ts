import { z } from 'zod';
import { codeSchema, listQuerySchema, requiredText, uuidSchema } from './common.schema.js';

/** Directorate → Division → Department → User (CLAUDE.md §4). */

export const directorateInputSchema = z.object({
  code: codeSchema,
  name: requiredText('Nama direktorat', 100),
});
export type DirectorateInput = z.input<typeof directorateInputSchema>;
export type DirectoratePayload = z.output<typeof directorateInputSchema>;

export const divisionInputSchema = z.object({
  code: codeSchema,
  name: requiredText('Nama divisi', 100),
  directorateId: uuidSchema,
});
export type DivisionInput = z.input<typeof divisionInputSchema>;
export type DivisionPayload = z.output<typeof divisionInputSchema>;

export const departmentInputSchema = z.object({
  code: codeSchema,
  name: requiredText('Nama departemen', 100),
  divisionId: uuidSchema,
});
export type DepartmentInput = z.input<typeof departmentInputSchema>;
export type DepartmentPayload = z.output<typeof departmentInputSchema>;

export const organizationListQuerySchema = listQuerySchema;

interface OrgUnitBase {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DirectorateDto extends OrgUnitBase {
  divisionCount: number;
}

export interface DivisionDto extends OrgUnitBase {
  directorate: { id: string; code: string; name: string };
  departmentCount: number;
}

export interface DepartmentDto extends OrgUnitBase {
  division: { id: string; code: string; name: string };
  directorate: { id: string; code: string; name: string };
  userCount: number;
}
