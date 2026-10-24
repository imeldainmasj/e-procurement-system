import { Router } from 'express';
import { idParamSchema, notificationListQuerySchema } from '@sipita/shared';
import { validate } from '../../middleware/validate.js';
import * as controller from './notifications.controller.js';

// Every user only ever sees their own notifications.
export const notificationsRouter = Router();

notificationsRouter.get('/', validate({ query: notificationListQuerySchema }), controller.list);
notificationsRouter.get('/unread-count', controller.unreadCount);
notificationsRouter.post('/read-all', controller.markAllRead);
notificationsRouter.post('/:id/read', validate({ params: idParamSchema }), controller.markRead);
