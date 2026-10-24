import type { RequestHandler } from 'express';
import type {
  IdParam,
  ItemCategoryPayload,
  ItemPayload,
  itemCategoryListQuerySchema,
  itemListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import { getActor } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/response.js';
import * as categories from './item-categories.service.js';
import * as items from './items.service.js';

// ─── Kategori ────────────────────────────────────────────────────────────────

export const listCategories: RequestHandler = async (req, res) => {
  const q = req.query as unknown as z.output<typeof itemCategoryListQuerySchema>;
  const { data, meta } = await categories.list(q);
  sendSuccess(res, data, meta);
};

export const getCategory: RequestHandler = async (req, res) => {
  sendSuccess(res, await categories.get((req.params as IdParam).id));
};

export const createCategory: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await categories.create(req.body as ItemCategoryPayload, getActor(req)),
    undefined,
    201,
  );
};

export const updateCategory: RequestHandler = async (req, res) => {
  const { id } = req.params as IdParam;
  sendSuccess(res, await categories.update(id, req.body as ItemCategoryPayload, getActor(req)));
};

export const removeCategory: RequestHandler = async (req, res) => {
  await categories.remove((req.params as IdParam).id, getActor(req));
  sendSuccess(res, null);
};

// ─── Item ────────────────────────────────────────────────────────────────────

export const listItems: RequestHandler = async (req, res) => {
  const { data, meta } = await items.list(
    req.query as unknown as z.output<typeof itemListQuerySchema>,
  );
  sendSuccess(res, data, meta);
};

export const getItem: RequestHandler = async (req, res) => {
  sendSuccess(res, await items.get((req.params as IdParam).id));
};

export const createItem: RequestHandler = async (req, res) => {
  sendSuccess(res, await items.create(req.body as ItemPayload, getActor(req)), undefined, 201);
};

export const updateItem: RequestHandler = async (req, res) => {
  const { id } = req.params as IdParam;
  sendSuccess(res, await items.update(id, req.body as ItemPayload, getActor(req)));
};

export const removeItem: RequestHandler = async (req, res) => {
  await items.remove((req.params as IdParam).id, getActor(req));
  sendSuccess(res, null);
};
