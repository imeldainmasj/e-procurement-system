import { Router } from 'express';
import { authenticate } from './middleware/auth.js';
import { attachmentsRouter } from './modules/attachments/attachments.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import {
  departmentsRouter,
  directoratesRouter,
  divisionsRouter,
} from './modules/organization/organization.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { vendorsRouter } from './modules/vendors/vendors.routes.js';

export const apiRouter = Router();

// Public
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);

// Authenticated (permission checks live in each router)
apiRouter.use('/users', authenticate, usersRouter);
apiRouter.use('/directorates', authenticate, directoratesRouter);
apiRouter.use('/divisions', authenticate, divisionsRouter);
apiRouter.use('/departments', authenticate, departmentsRouter);
apiRouter.use('/vendors', authenticate, vendorsRouter);
apiRouter.use('/notifications', authenticate, notificationsRouter);
apiRouter.use('/attachments', authenticate, attachmentsRouter);
apiRouter.use('/settings', authenticate, settingsRouter);
