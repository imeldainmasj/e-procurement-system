import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import type { LoginInput } from '@sipita/shared';
import { isProduction } from '../../config/env.js';
import { requireUser } from '../../middleware/auth.js';
import { sendSuccess } from '../../utils/response.js';
import * as authService from './auth.service.js';

export const REFRESH_COOKIE = 'sipita_rt';

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/api/v1/auth',
};

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

function sendSession(res: Response, issued: authService.IssuedSession): void {
  res.cookie(REFRESH_COOKIE, issued.refreshToken, {
    ...refreshCookieOptions,
    expires: issued.refreshExpiresAt,
  });
  sendSuccess(res, issued.session);
}

export const login: RequestHandler = async (req, res) => {
  sendSession(res, await authService.login(req.body as LoginInput));
};

// The cookie is deliberately not cleared on failure: when two tabs refresh at once, the
// losing tab's 401 must not wipe the fresh cookie the winning tab just received.
export const refresh: RequestHandler = async (req, res) => {
  sendSession(res, await authService.refresh(readRefreshCookie(req)));
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  sendSuccess(res, null);
};

export const me: RequestHandler = async (req, res) => {
  sendSuccess(res, await authService.getMe(requireUser(req).id));
};
