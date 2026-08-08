import { describe, it, expect, beforeAll } from 'vitest';
import supertest, { Test } from 'supertest';
import TestAgent from 'supertest/lib/agent';

import app from '@src/server';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';


let agent: TestAgent<Test>;

describe('App wiring', () => {
  beforeAll(() => {
    agent = supertest.agent(app);
  });

  it('redirects the root path to the users page', async () => {
    const res = await agent.get('/');
    expect(res.status).toBe(HTTP_STATUS_CODES.Found);
    expect(res.headers.location).toBe('/users');
  });

  it('mounts the payments webhook route and does not hang without an idempotency key', async () => {
    // No idempotency-key header: the middleware should fall through (next())
    // and the Flutterwave webhook should reject the invalid signature.
    const res = await agent.post('/api/payments/webhook/flutterwave')
      .send({ event: 'charge.completed', data: {} });
    expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
  });

  it('returns 404 for unmounted API routes', async () => {
    const res = await agent.get('/api/does-not-exist');
    expect(res.status).toBe(HTTP_STATUS_CODES.NotFound);
  });
});
