import { describe, expect, it } from 'vitest';
import '../zod.js';
import { approvalRuleInputSchema } from './approval-rule.schema.js';
import { codeSchema, optionalText } from './common.schema.js';
import { userCreateSchema, userUpdateSchema } from './user.schema.js';

describe('codeSchema', () => {
  it('uppercases and trims', () => {
    expect(codeSchema.parse('  lpt-01 ')).toBe('LPT-01');
  });
  it('rejects spaces and symbols', () => {
    expect(codeSchema.safeParse('LPT 01').success).toBe(false);
  });
});

describe('optionalText', () => {
  it('turns empty strings into null', () => {
    expect(optionalText().parse('  ')).toBeNull();
    expect(optionalText().parse(undefined)).toBeNull();
  });
});

describe('user schemas', () => {
  const base = {
    name: 'Andi',
    email: 'ANDI@Perusahaan.co.id',
    roles: ['APPROVER'],
    password: 'rahasia123',
  };

  it('requires approvalLevel for APPROVER', () => {
    const res = userCreateSchema.safeParse(base);
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path).toEqual(['approvalLevel']);
  });

  it('drops approvalLevel for non-approvers and normalizes email', () => {
    const res = userUpdateSchema.parse({ ...base, roles: ['REQUESTER'], approvalLevel: 2 });
    expect(res.approvalLevel).toBeNull();
    expect(res.email).toBe('andi@perusahaan.co.id');
  });

  it('enforces password strength', () => {
    expect(
      userCreateSchema.safeParse({ ...base, approvalLevel: 1, password: 'abcdefgh' }).success,
    ).toBe(false);
    expect(userCreateSchema.safeParse({ ...base, approvalLevel: 1 }).success).toBe(true);
  });
});

describe('approvalRuleInputSchema', () => {
  const rule = { name: 'R', minAmount: 0, maxAmount: 10_000_000, levels: [1] };

  it('applies bound defaults', () => {
    expect(approvalRuleInputSchema.parse(rule)).toMatchObject({
      minInclusive: true,
      maxInclusive: false,
    });
  });

  it('requires ascending unique levels', () => {
    expect(approvalRuleInputSchema.safeParse({ ...rule, levels: [2, 1] }).success).toBe(false);
    expect(approvalRuleInputSchema.safeParse({ ...rule, levels: [1, 1] }).success).toBe(false);
  });

  it('requires max above min', () => {
    expect(approvalRuleInputSchema.safeParse({ ...rule, maxAmount: 0 }).success).toBe(false);
  });

  it('clears maxInclusive when unbounded', () => {
    expect(
      approvalRuleInputSchema.parse({ ...rule, maxAmount: null, maxInclusive: true }).maxInclusive,
    ).toBe(false);
  });
});
