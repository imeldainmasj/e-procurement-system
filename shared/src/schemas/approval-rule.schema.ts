import { z } from 'zod';
import { requiredText } from './common.schema.js';

// Stays well inside Number.MAX_SAFE_INTEGER so cents are exact (Rp 9,9 triliun).
const MAX_AMOUNT = 9_999_999_999_999;

const amountSchema = z.coerce
  .number({ message: 'Nominal harus berupa angka' })
  .min(0, { message: 'Nominal tidak boleh negatif' })
  .max(MAX_AMOUNT, { message: 'Nominal terlalu besar' })
  .transform((v) => Math.round(v * 100) / 100);

export const approvalRuleInputSchema = z
  .object({
    name: requiredText('Nama aturan', 100),
    minAmount: amountSchema,
    minInclusive: z.boolean().default(true),
    maxAmount: amountSchema.nullish().transform((v) => v ?? null),
    maxInclusive: z.boolean().default(false),
    levels: z
      .array(z.coerce.number().int().min(1).max(10), { message: 'Level approval wajib diisi' })
      .min(1, { message: 'Pilih minimal satu level approval' })
      .refine((lv) => lv.every((v, i) => i === 0 || v > lv[i - 1]!), {
        message: 'Level harus unik dan berurutan naik (mis. 1, 2, 3)',
      }),
    isActive: z.boolean().default(true),
  })
  .refine(
    (r) =>
      r.maxAmount === null ||
      r.maxAmount > r.minAmount ||
      (r.maxAmount === r.minAmount && r.minInclusive && r.maxInclusive),
    { message: 'Batas atas harus lebih besar dari batas bawah', path: ['maxAmount'] },
  )
  .transform((r) => (r.maxAmount === null ? { ...r, maxInclusive: false } : r));
export type ApprovalRuleInput = z.input<typeof approvalRuleInputSchema>;
export type ApprovalRulePayload = z.output<typeof approvalRuleInputSchema>;

export interface ApprovalRuleDto {
  id: string;
  name: string;
  /** Decimal serialized as string, e.g. "10000000.00" */
  minAmount: string;
  minInclusive: boolean;
  maxAmount: string | null;
  maxInclusive: boolean;
  levels: number[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRuleListResult {
  rules: ApprovalRuleDto[];
  /** Coverage problems among active rules (gaps), in Indonesian; empty when complete. */
  warnings: string[];
}
