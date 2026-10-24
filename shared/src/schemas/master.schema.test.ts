import { describe, expect, it } from 'vitest';
import '../zod.js';
import { FULL_PERMISSION, toPermissionMap } from '../access.js';
import { codeSchema, optionalText } from './common.schema.js';
import { settingsInputSchema, SETTING_DEFAULTS } from './setting.schema.js';
import { userCreateSchema } from './user.schema.js';

describe('codeSchema', () => {
  it('uppercases and trims', () => {
    expect(codeSchema.parse('  dir-ops ')).toBe('DIR-OPS');
  });
  it('rejects spaces and symbols', () => {
    expect(codeSchema.safeParse('DIR OPS').success).toBe(false);
  });
});

describe('optionalText', () => {
  it('turns empty strings into null', () => {
    expect(optionalText().parse('  ')).toBeNull();
    expect(optionalText().parse(undefined)).toBeNull();
  });
});

describe('userCreateSchema', () => {
  const permissions = Object.fromEntries(
    Object.keys(toPermissionMap([])).map((f) => [f, FULL_PERMISSION]),
  );
  const base = {
    employeeId: '19870001',
    username: 'Andi.Pratama',
    name: 'Andi',
    email: 'ANDI@Perusahaan.co.id',
    jobLevel: 'STAFF',
    password: 'rahasia123',
    permissions,
  };

  it('normalizes username and email', () => {
    const res = userCreateSchema.parse(base);
    expect(res.username).toBe('andi.pratama');
    expect(res.email).toBe('andi@perusahaan.co.id');
    expect(res.isAdmin).toBe(false);
  });

  it('rejects usernames with spaces', () => {
    expect(userCreateSchema.safeParse({ ...base, username: 'andi pratama' }).success).toBe(false);
  });

  it('enforces password strength', () => {
    expect(userCreateSchema.safeParse({ ...base, password: 'abcdefgh' }).success).toBe(false);
  });

  it('requires a flag set for every feature', () => {
    const { WORK: _work, ...partial } = permissions;
    expect(userCreateSchema.safeParse({ ...base, permissions: partial }).success).toBe(false);
  });
});

describe('settingsInputSchema', () => {
  it('accepts the defaults', () => {
    expect(settingsInputSchema.parse(SETTING_DEFAULTS)).toEqual(SETTING_DEFAULTS);
  });

  it('dedupes and sorts reminder days descending', () => {
    const res = settingsInputSchema.parse({
      ...SETTING_DEFAULTS,
      CONTRACT_REMINDER_DAYS: [30, 90, 30],
    });
    expect(res.CONTRACT_REMINDER_DAYS).toEqual([90, 30]);
  });

  it('requires at least one director approval', () => {
    expect(
      settingsInputSchema.safeParse({ ...SETTING_DEFAULTS, PVP_MIN_DIRECTOR_APPROVALS: 0 }).success,
    ).toBe(false);
  });
});
