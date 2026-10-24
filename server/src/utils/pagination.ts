import type { PaginationMeta } from '@sipita/shared';
import { AppError } from './AppError.js';

interface PageQuery {
  page: number;
  limit: number;
  sort?: string | undefined;
}

export function pageArgs(q: PageQuery): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.limit, take: q.limit };
}

export function pageMeta(q: PageQuery, total: number): PaginationMeta {
  return { page: q.page, limit: q.limit, total };
}

/**
 * Turns `field:dir` (dot paths allowed for relations, e.g. `category.name:asc`) into a
 * Prisma orderBy array. Only whitelisted fields are accepted; `id` is appended as a
 * tie-breaker so pagination is stable.
 */
export function buildOrderBy<T>(
  sort: string | undefined,
  allowed: readonly string[],
  fallback: T,
): T[] {
  const tieBreaker = { id: 'asc' } as T;
  if (!sort) return [fallback, tieBreaker];

  const [field, dir] = sort.split(':') as [string, 'asc' | 'desc'];
  if (!allowed.includes(field)) {
    throw AppError.badRequest(`Kolom pengurutan "${field}" tidak didukung`);
  }
  const order = field.split('.').reduceRight<unknown>((acc, key) => ({ [key]: acc }), dir) as T;
  return [order, tieBreaker];
}

/** Case-insensitive `contains` filter over several columns. */
export function searchFilter(search: string | undefined, fields: readonly string[]) {
  if (!search) return {};
  return {
    OR: fields.map((field) => ({ [field]: { contains: search, mode: 'insensitive' as const } })),
  };
}
