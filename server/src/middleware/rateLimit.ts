import { rateLimit } from 'express-rate-limit';
import type { ApiErrorBody } from '@sipita/shared';

const tooManyRequests: ApiErrorBody = {
  success: false,
  error: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.',
    details: [],
  },
};

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: tooManyRequests,
});
