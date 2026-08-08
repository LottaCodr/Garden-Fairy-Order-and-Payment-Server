import { describe, it, expect, beforeAll, vi } from 'vitest';
import supertest, { Test } from 'supertest';
import TestAgent from 'supertest/lib/agent';

import app from '@src/server';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { signToken } from '@src/config/jwt';

// The User model is mocked in tests/support/setup.ts (registered before the
// app module graph is evaluated), so `protect` can authenticate requests
// without a MongoDB connection. Endpoints are exercised up to their
// input-validation gates.
import { userMocks } from './support/mocks';

const FAKE_USER = {
  _id: '64b7f0f5a4f5c1a2b3c4d5e6',
  name: 'Test User',
  email: 'test@example.com',
  role: 'customer',
};

const mockAuth = () => {
  userMocks.findById.mockReturnValue({
    select: vi.fn().mockResolvedValue(FAKE_USER),
  } as never);
  return signToken(FAKE_USER._id);
};

let agent: TestAgent<Test>;

describe('Garden Fairy API', () => {
  beforeAll(() => {
    agent = supertest.agent(app);
  });

  describe('health & 404 handling', () => {
    it('exposes a health check endpoint', async () => {
      const res = await agent.get('/api/health');
      expect(res.status).toBe(HTTP_STATUS_CODES.Ok);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.uptime).toBe('number');
    });

    it('returns a JSON 404 for unknown API routes', async () => {
      const res = await agent.get('/api/not-a-real-route');
      expect(res.status).toBe(HTTP_STATUS_CODES.NotFound);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('auth input validation (no DB required)', () => {
    it('rejects registration with an empty body', async () => {
      const res = await agent.post('/api/auth/register').send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
    });

    it('rejects registration with a weak password', async () => {
      const res = await agent.post('/api/auth/register').send({
        name: 'Test',
        email: 'test@example.com',
        password: 'short',
      });
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
      expect(res.body.message).toMatch(/password/i);
    });

    it('rejects registration with an invalid email', async () => {
      const res = await agent.post('/api/auth/register').send({
        name: 'Test',
        email: 'not-an-email',
        password: 'long-enough-password',
      });
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
    });

    it('rejects login without credentials', async () => {
      const res = await agent.post('/api/auth/login').send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
    });

    it('returns 401 for unknown credentials', async () => {
      userMocks.findOne.mockResolvedValue(null);
      const res = await agent.post('/api/auth/login').send({
        email: 'ghost@example.com',
        password: 'whatever-password',
      });
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });
  });

  describe('authentication enforcement', () => {
    it('rejects /api/orders without a token', async () => {
      const res = await agent.post('/api/orders').send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });

    it('rejects GET /api/orders/my without a token', async () => {
      const res = await agent.get('/api/orders/my');
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });

    it('rejects POST /api/payments/initialize without a token', async () => {
      const res = await agent.post('/api/payments/initialize').send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });

    it('rejects GET /api/payments/verify/:txRef without a token', async () => {
      const res = await agent.get('/api/payments/verify/GF-123');
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });

    it('rejects admin plant creation without a token', async () => {
      const res = await agent.post('/api/plants').send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });

    it('rejects admin order listing without a token', async () => {
      const res = await agent.get('/api/admin/orders');
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });

    it('rejects a malformed bearer token', async () => {
      const res = await agent.get('/api/auth/me')
        .set('Authorization', 'Bearer not-a-real-token');
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });
  });

  describe('order creation validation (authenticated)', () => {
    it('rejects a create-order request without items', async () => {
      const token = mockAuth();
      const res = await agent.post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
      expect(res.body.message).toMatch(/items/i);
    });

    it('rejects order items with a non-positive quantity', async () => {
      const token = mockAuth();
      const res = await agent.post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: '64b7f0f5a4f5c1a2b3c4d5e6', qty: 0 }],
          shippingAddress: { state: 'Lagos', city: 'Ikeja', phone: '0801' },
        });
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
      expect(res.body.message).toMatch(/qty/i);
    });

    it('rejects orders without a shipping address', async () => {
      const token = mockAuth();
      const res = await agent.post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: '64b7f0f5a4f5c1a2b3c4d5e6', qty: 1 }],
        });
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
      expect(res.body.message).toMatch(/shippingAddress/i);
    });

    it('rejects an unknown delivery method', async () => {
      const token = mockAuth();
      const res = await agent.post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: '64b7f0f5a4f5c1a2b3c4d5e6', qty: 1 }],
          shippingAddress: { state: 'Lagos', city: 'Ikeja', phone: '0801' },
          deliveryMethod: 'teleport',
        });
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
      expect(res.body.message).toMatch(/deliveryMethod/i);
    });
  });

  describe('payment validation (authenticated)', () => {
    it('requires an orderId to initialize a payment', async () => {
      const token = mockAuth();
      const res = await agent.post('/api/payments/initialize')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
      expect(res.body.message).toMatch(/orderId/i);
    });
  });

  describe('profile update (authenticated)', () => {
    it('rejects an empty profile update', async () => {
      const token = mockAuth();
      const res = await agent.put('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
      expect(res.body.message).toMatch(/nothing to update/i);
    });

    it('updates the profile and returns a sanitized user', async () => {
      const token = mockAuth();
      userMocks.findByIdAndUpdate.mockResolvedValue({
        _id: FAKE_USER._id,
        name: 'New Name',
        email: FAKE_USER.email,
        role: FAKE_USER.role,
      } as never);

      const res = await agent.put('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(HTTP_STATUS_CODES.Ok);
      expect(res.body.user.name).toBe('New Name');
      expect(res.body.user).not.toHaveProperty('password');
    });
  });
});
