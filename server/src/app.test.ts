import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from './app.js';
import { errorHandler } from './middleware/errorHandler.js';
import { validate } from './middleware/validate.js';
import { AppError } from './utils/AppError.js';

describe('app', () => {
  const app = createApp();

  it('GET /api/v1/health returns ok envelope', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('unknown route returns NOT_FOUND error envelope', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('malformed JSON returns INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('validate + errorHandler', () => {
  const app = express();
  app.use(express.json());
  app.get(
    '/items',
    validate({ query: z.object({ page: z.coerce.number().int().min(1) }) }),
    (req, res) => {
      res.json({ page: req.query.page });
    },
  );
  app.post('/items', validate({ body: z.object({ name: z.string().min(1) }) }), (req, res) => {
    res.status(201).json(req.body);
  });
  app.get('/boom', () => {
    throw new AppError(422, 'BUSINESS_RULE', 'Aturan bisnis dilanggar');
  });
  app.use(errorHandler);

  it('replaces req.query with parsed values', async () => {
    const res = await request(app).get('/items?page=2');
    expect(res.body).toEqual({ page: 2 });
  });

  it('returns VALIDATION_ERROR with details', async () => {
    const res = await request(app).post('/items').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0]).toMatchObject({ path: 'name' });
  });

  it('maps AppError to its status and code', async () => {
    const res = await request(app).get('/boom');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'BUSINESS_RULE', message: 'Aturan bisnis dilanggar', details: [] },
    });
  });
});
