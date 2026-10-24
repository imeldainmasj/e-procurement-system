import type { ApiSuccess, PaginationMeta } from '@sipita/shared';
import { api } from './client';

export interface ListParams {
  page: number;
  limit: number;
  search?: string;
  sort?: string;
  [filter: string]: string | number | boolean | undefined;
}

export interface ListResult<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Drops empty values so they are not sent as `?status=`. */
export function cleanParams(params: object): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Record<string, string | number | boolean>;
}

export interface ResourceApi<TDto, TInput> {
  list: (params: ListParams) => Promise<ListResult<TDto>>;
  get: (id: string) => Promise<TDto>;
  create: (input: TInput) => Promise<TDto>;
  update: (id: string, input: TInput) => Promise<TDto>;
  remove: (id: string) => Promise<void>;
}

/** Standard CRUD calls for a REST resource such as `/divisions`. */
export function createResourceApi<TDto, TInput>(path: string): ResourceApi<TDto, TInput> {
  return {
    async list(params) {
      const res = await api.get<ApiSuccess<TDto[]>>(path, { params: cleanParams(params) });
      return {
        data: res.data.data,
        meta: res.data.meta ?? {
          page: 1,
          limit: res.data.data.length,
          total: res.data.data.length,
        },
      };
    },
    async get(id) {
      return (await api.get<ApiSuccess<TDto>>(`${path}/${id}`)).data.data;
    },
    async create(input) {
      return (await api.post<ApiSuccess<TDto>>(path, input)).data.data;
    },
    async update(id, input) {
      return (await api.put<ApiSuccess<TDto>>(`${path}/${id}`, input)).data.data;
    },
    async remove(id) {
      await api.delete(`${path}/${id}`);
    },
  };
}
