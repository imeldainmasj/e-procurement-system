import { describe, expect, it } from 'vitest';
import { AppError } from './AppError.js';
import { buildOrderBy, pageArgs, searchFilter } from './pagination.js';

describe('pagination utils', () => {
  it('computes skip/take', () => {
    expect(pageArgs({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('builds nested orderBy for relation paths', () => {
    expect(buildOrderBy('category.name:desc', ['category.name'], { code: 'asc' })).toEqual([
      { category: { name: 'desc' } },
      { id: 'asc' },
    ]);
  });

  it('falls back when no sort is given', () => {
    expect(buildOrderBy(undefined, [], { code: 'asc' })).toEqual([{ code: 'asc' }, { id: 'asc' }]);
  });

  it('rejects fields outside the whitelist', () => {
    expect(() => buildOrderBy('passwordHash:asc', ['name'], {})).toThrow(AppError);
  });

  it('builds a case-insensitive OR search', () => {
    expect(searchFilter('lap', ['code', 'name'])).toEqual({
      OR: [
        { code: { contains: 'lap', mode: 'insensitive' } },
        { name: { contains: 'lap', mode: 'insensitive' } },
      ],
    });
    expect(searchFilter(undefined, ['code'])).toEqual({});
  });
});
