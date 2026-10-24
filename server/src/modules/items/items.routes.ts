import { Router } from 'express';
import {
  idParamSchema,
  itemCategoryInputSchema,
  itemCategoryListQuerySchema,
  itemInputSchema,
  itemListQuerySchema,
} from '@sipita/shared';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './items.controller.js';

const admin = requireRole('SUPER_ADMIN');

// Catalog is readable by every signed-in user (PR form); only SUPER_ADMIN edits it.
export const itemCategoriesRouter = Router();
itemCategoriesRouter.get(
  '/',
  validate({ query: itemCategoryListQuerySchema }),
  controller.listCategories,
);
itemCategoriesRouter.get('/:id', validate({ params: idParamSchema }), controller.getCategory);
itemCategoriesRouter.post(
  '/',
  admin,
  validate({ body: itemCategoryInputSchema }),
  controller.createCategory,
);
itemCategoriesRouter.put(
  '/:id',
  admin,
  validate({ params: idParamSchema, body: itemCategoryInputSchema }),
  controller.updateCategory,
);
itemCategoriesRouter.delete(
  '/:id',
  admin,
  validate({ params: idParamSchema }),
  controller.removeCategory,
);

export const itemsRouter = Router();
itemsRouter.get('/', validate({ query: itemListQuerySchema }), controller.listItems);
itemsRouter.get('/:id', validate({ params: idParamSchema }), controller.getItem);
itemsRouter.post('/', admin, validate({ body: itemInputSchema }), controller.createItem);
itemsRouter.put(
  '/:id',
  admin,
  validate({ params: idParamSchema, body: itemInputSchema }),
  controller.updateItem,
);
itemsRouter.delete('/:id', admin, validate({ params: idParamSchema }), controller.removeItem);
