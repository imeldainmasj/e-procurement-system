import { z } from 'zod';
import {
  EXECUTORS,
  MILESTONE_TYPES,
  PROCUREMENT_METHODS,
  type Executor,
  type MilestoneType,
  type ProcurementMethod,
} from '../enums.js';
import { MILESTONE_TYPE_LABELS } from '../status.js';

export const milestoneTemplateItemSchema = z.object({
  type: z.enum(MILESTONE_TYPES, { message: 'Jenis milestone wajib dipilih' }),
  sequence: z.coerce
    .number({ message: 'Urutan harus berupa angka' })
    .int({ message: 'Urutan harus bilangan bulat' })
    .min(1, { message: 'Urutan minimal 1' })
    .max(50, { message: 'Urutan maksimal 50' }),
  executor: z.enum(EXECUTORS, { message: 'Pelaksana wajib dipilih' }),
  prerequisites: z.array(z.enum(MILESTONE_TYPES)).default([]),
  isConditional: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type MilestoneTemplateItem = z.output<typeof milestoneTemplateItemSchema>;

/**
 * One method's whole template. Prerequisites must point to an earlier active milestone of
 * the same template, which also rules out cycles.
 */
export const milestoneTemplateInputSchema = z
  .object({ items: z.array(milestoneTemplateItemSchema).min(1, { message: 'Template kosong' }) })
  .superRefine(({ items }, ctx) => {
    const seen = new Set<MilestoneType>();
    items.forEach((item, i) => {
      if (seen.has(item.type)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'type'],
          message: `${MILESTONE_TYPE_LABELS[item.type]} muncul lebih dari sekali`,
        });
      }
      seen.add(item.type);
    });

    const active = new Map(items.filter((t) => t.isActive).map((t) => [t.type, t]));
    if (active.size === 0) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Minimal satu milestone aktif' });
    }
    items.forEach((item, i) => {
      if (!item.isActive) return;
      for (const pre of item.prerequisites) {
        const target = active.get(pre);
        if (!target || target.sequence >= item.sequence) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', i, 'prerequisites'],
            message: `Prasyarat ${MILESTONE_TYPE_LABELS[pre]} harus milestone aktif dengan urutan lebih awal`,
          });
        }
      }
    });
  });
export type MilestoneTemplateInput = z.input<typeof milestoneTemplateInputSchema>;
export type MilestoneTemplatePayload = z.output<typeof milestoneTemplateInputSchema>;

export const methodParamSchema = z.object({
  method: z.enum(PROCUREMENT_METHODS, { message: 'Metode tidak dikenal' }),
});

export interface MilestoneTemplateDto {
  id: string;
  method: ProcurementMethod;
  type: MilestoneType;
  sequence: number;
  executor: Executor;
  prerequisites: MilestoneType[];
  isConditional: boolean;
  isActive: boolean;
}
