import { Router } from 'express';
import { loginSchema } from '@sipita/shared';
import { authenticate } from '../../middleware/auth.js';
import { loginRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, validate({ body: loginSchema }), controller.login);
authRouter.post('/refresh', controller.refresh);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', authenticate, controller.me);
