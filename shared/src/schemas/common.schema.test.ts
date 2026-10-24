import { describe, expect, it } from 'vitest';
import { listQuerySchema } from './common.schema.js';

describe('listQuerySchema', () => {
  it('applies defaults', () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces numeric strings', () => {
    expect(listQuerySchema.parse({ page: '3', limit: '50' })).toMatchObject({ page: 3, limit: 50 });
  });

  it('rejects limit above max', () => {
    expect(listQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('validates sort format', () => {
    expect(listQuerySchema.safeParse({ sort: 'createdAt:desc' }).success).toBe(true);
    expect(listQuerySchema.safeParse({ sort: 'createdAt' }).success).toBe(false);
  });
});
