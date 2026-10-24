import { Router } from 'express';
import { authenticate } from './middleware/auth.js';
import { approvalRulesRouter } from './modules/approval-rules/approval-rules.routes.js';
import { approvalsRouter } from './modules/approvals/approvals.routes.js';
import { attachmentsRouter } from './modules/attachments/attachments.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { divisionsRouter } from './modules/divisions/divisions.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { itemCategoriesRouter, itemsRouter } from './modules/items/items.routes.js';
import { memosRouter } from './modules/memos/memos.routes.js';
import { priceHistoryRouter } from './modules/price-history/price-history.routes.js';
import { purchaseOrdersRouter } from './modules/purchase-orders/purchase-orders.routes.js';
import { quotationsRouter } from './modules/quotations/quotations.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { purchaseRequestsRouter } from './modules/purchase-requests/purchase-requests.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { vendorsRouter } from './modules/vendors/vendors.routes.js';
import { warehousesRouter } from './modules/warehouses/warehouses.routes.js';

export const apiRouter = Router();

// Public
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);

// Authenticated (role checks live in each router)
apiRouter.use('/users', authenticate, usersRouter);
apiRouter.use('/divisions', authenticate, divisionsRouter);
apiRouter.use('/item-categories', authenticate, itemCategoriesRouter);
apiRouter.use('/items', authenticate, itemsRouter);
apiRouter.use('/warehouses', authenticate, warehousesRouter);
apiRouter.use('/approval-rules', authenticate, approvalRulesRouter);
apiRouter.use('/purchase-requests', authenticate, purchaseRequestsRouter);
apiRouter.use('/memos', authenticate, memosRouter);
apiRouter.use('/approvals', authenticate, approvalsRouter);
apiRouter.use('/notifications', authenticate, notificationsRouter);
apiRouter.use('/vendors', authenticate, vendorsRouter);
apiRouter.use('/attachments', authenticate, attachmentsRouter);
apiRouter.use('/settings', authenticate, settingsRouter);
apiRouter.use('/quotations', authenticate, quotationsRouter);
apiRouter.use('/purchase-orders', authenticate, purchaseOrdersRouter);
apiRouter.use('/price-history', authenticate, priceHistoryRouter);
apiRouter.use('/dashboard', authenticate, dashboardRouter);
