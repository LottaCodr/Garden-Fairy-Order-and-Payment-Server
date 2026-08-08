import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import supertest, { Test } from 'supertest';
import TestAgent from 'supertest/lib/agent';

import app from '@src/server';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { signToken } from '@src/config/jwt';

import { userMocks } from './support/mocks';
import { Cart } from '@src/models/cart.model';
import { DeliveryRate } from '@src/models/deliveryRate.model';
import { StoreSetting } from '@src/models/storeSetting.model';
import { ContactMessage } from '@src/models/contactMessage.model';
import { NewsletterSubscriber } from '@src/models/newsletterSubscriber.model';

// NOTE on suites: mongoose models other than User are exercised through
// vi.spyOn on the shared model classes (setup.ts only module-mocks User).

const fakeEmptyCart = () => ({
  _id: '64b7f0f5a4f5c1a2b3c4d001',
  items: [],
  populate: vi.fn().mockResolvedValue(undefined),
});

const mockAuthCustomer = () => {
  const user = {
    _id: '64b7f0f5a4f5c1a2b3c4d5e6',
    name: 'Test User',
    email: 'test@example.com',
    role: 'customer',
  };
  userMocks.findById.mockReturnValue({
    select: vi.fn().mockResolvedValue(user),
  } as never);
  return signToken(user._id);
};

let agent: TestAgent<Test>;

describe('Garden Fairy spec features', () => {
  beforeAll(() => {
    agent = supertest.agent(app);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkout delivery estimate (POST /api/checkout/estimate)', () => {
    it('rejects a missing state', async () => {
      const res = await agent.post('/api/checkout/estimate').send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
    });

    it('returns the DeliveryRate table fee + ETA for a known state', async () => {
      vi.spyOn(StoreSetting, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as never);
      const rateSpy = vi.spyOn(DeliveryRate, 'findOne').mockResolvedValue({
        state: 'Lagos', fee: 3500, etaDays: 2,
      } as never);

      const res = await agent.post('/api/checkout/estimate')
        .send({ state: 'Lagos', subtotal: 1000 });

      expect(res.status).toBe(HTTP_STATUS_CODES.Ok);
      expect(res.body.data.deliveryFee).toBe(3500);
      expect(res.body.data.etaDays).toBe(2);
      expect(rateSpy).toHaveBeenCalled();
    });

    it('falls back to the flat deliveryFee setting for unknown states', async () => {
      vi.spyOn(StoreSetting, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as never);
      vi.spyOn(DeliveryRate, 'findOne').mockResolvedValue(null as never);

      const res = await agent.post('/api/checkout/estimate')
        .send({ state: 'Sokoto', subtotal: 1000 });

      expect(res.status).toBe(HTTP_STATUS_CODES.Ok);
      expect(res.body.data.deliveryFee).toBe(3500); // default flat fee
      expect(res.body.data.etaDays).toBeNull();
    });

    it('applies free shipping above the configured threshold', async () => {
      vi.spyOn(StoreSetting, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as never);
      vi.spyOn(DeliveryRate, 'findOne').mockResolvedValue({
        state: 'Lagos', fee: 3500, etaDays: 2,
      } as never);

      const res = await agent.post('/api/checkout/estimate')
        .send({ state: 'Lagos', subtotal: 60000 });

      expect(res.status).toBe(HTTP_STATUS_CODES.Ok);
      expect(res.body.data.deliveryFee).toBe(0);
      expect(res.body.data.freeShippingApplied).toBe(true);
    });
  });

  describe('public settings (GET /api/settings)', () => {
    it('returns the storefront-safe subset', async () => {
      vi.spyOn(StoreSetting, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as never);

      const res = await agent.get('/api/settings');

      expect(res.status).toBe(HTTP_STATUS_CODES.Ok);
      expect(res.body.data.storeName).toBe('The Garden Fairy');
      expect(res.body.data.freeShippingThreshold).toBe(50000);
      expect(res.body.data).not.toHaveProperty('vipThreshold');
    });
  });

  describe('contact & newsletter', () => {
    it('rejects an empty contact submission', async () => {
      const res = await agent.post('/api/contact').send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
    });

    it('persists a valid contact message', async () => {
      const createSpy = vi.spyOn(ContactMessage, 'create')
        .mockResolvedValue({ _id: 'msg1' } as never);

      const res = await agent.post('/api/contact').send({
        name: 'Ada',
        email: 'ada@example.com',
        subject: 'Delivery question',
        message: 'When will my plants arrive?',
      });

      expect(res.status).toBe(HTTP_STATUS_CODES.Created);
      expect(createSpy).toHaveBeenCalledOnce();
    });

    it('subscribes a new newsletter email', async () => {
      vi.spyOn(NewsletterSubscriber, 'findOne').mockResolvedValue(null as never);
      const createSpy = vi.spyOn(NewsletterSubscriber, 'create')
        .mockResolvedValue({} as never);

      const res = await agent.post('/api/newsletter/subscribe')
        .send({ email: 'plant-fan@example.com' });

      expect(res.status).toBe(HTTP_STATUS_CODES.Created);
      expect(createSpy).toHaveBeenCalledOnce();
    });

    it('dedupes an already-subscribed email', async () => {
      vi.spyOn(NewsletterSubscriber, 'findOne').mockResolvedValue({
        email: 'plant-fan@example.com',
        unsubscribedAt: undefined,
      } as never);

      const res = await agent.post('/api/newsletter/subscribe')
        .send({ email: 'plant-fan@example.com' });

      expect(res.status).toBe(HTTP_STATUS_CODES.Ok);
      expect(res.body.message).toMatch(/already subscribed/i);
    });

    it('404s when unsubscribing an unknown email', async () => {
      vi.spyOn(NewsletterSubscriber, 'findOne').mockResolvedValue(null as never);

      const res = await agent.post('/api/newsletter/unsubscribe')
        .send({ email: 'ghost@example.com' });

      expect(res.status).toBe(HTTP_STATUS_CODES.NotFound);
    });
  });

  describe('wishlist & reviews gates', () => {
    it('rejects wishlist access without a token', async () => {
      const res = await agent.get('/api/wishlist');
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });

    it('rejects adding to the wishlist without a token', async () => {
      const res = await agent.post('/api/wishlist/prod123');
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });

    it('rejects a review without a token', async () => {
      const res = await agent.post('/api/products/some-id/reviews')
        .send({ rating: 5 });
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });

    it('rejects a review with an invalid rating', async () => {
      const token = mockAuthCustomer();
      const res = await agent.post('/api/products/some-id/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 9 });
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
    });
  });

  describe('session token lifecycle', () => {
    it('rejects refresh without a token', async () => {
      const res = await agent.post('/api/auth/refresh').send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });

    it('rejects a bogus refresh token', async () => {
      const { RefreshToken } = await import('@src/models/refreshToken.model');
      vi.spyOn(RefreshToken, 'findOne').mockResolvedValue(null as never);

      const res = await agent.post('/api/auth/refresh')
        .send({ refreshToken: 'bogus' });
      expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
    });

    it('signs out and clears session cookies', async () => {
      const res = await agent.post('/api/auth/signout').send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.Ok);

      const rawCookies = res.headers['set-cookie'];
      const cookies = Array.isArray(rawCookies)
        ? rawCookies.join(';')
        : (rawCookies ?? '');
      expect(cookies).toContain('gf_access');
      expect(cookies).toContain('gf_refresh');
    });

    it('demo login is unavailable outside development', async () => {
      const res = await agent.post('/api/auth/demo-login').send({});
      expect(res.status).toBe(HTTP_STATUS_CODES.NotFound);
    });

    it('rejects reset-password without a token', async () => {
      const res = await agent.post('/api/auth/reset-password')
        .send({ password: 'long-enough' });
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
    });

    it('does not leak whether a forgot-password email exists', async () => {
      userMocks.findOne.mockResolvedValue(null as never);
      const res = await agent.post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' });
      expect(res.status).toBe(HTTP_STATUS_CODES.Ok);
    });
  });

  describe('address book validation', () => {
    it('rejects an address without required fields', async () => {
      const token = mockAuthCustomer();
      const res = await agent.post('/api/auth/me/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ label: 'Home' });
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
    });

    it('rejects a full-addresses replace with bad rows', async () => {
      const token = mockAuthCustomer();
      const res = await agent.patch('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ addresses: [{ street: '1 Way' }] });
      expect(res.status).toBe(HTTP_STATUS_CODES.BadRequest);
    });
  });

  describe('guest cart (session cookie)', () => {
    it('creates an empty guest cart and sets a session cookie', async () => {
      const findSpy = vi.spyOn(Cart, 'findOne').mockReturnValue({
        populate: vi.fn().mockResolvedValue(null),
      } as never);
      const createSpy = vi.spyOn(Cart, 'create')
        .mockResolvedValue(fakeEmptyCart() as never);

      const res = await agent.get('/api/cart');

      expect(res.status).toBe(HTTP_STATUS_CODES.Ok);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.subtotal).toBe(0);
      const setCookie = res.headers['set-cookie'];
      expect(Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? ''))
        .toContain('gf_session');
      expect(createSpy).toHaveBeenCalledOnce();
      expect(findSpy).toHaveBeenCalledWith({
        sessionId: expect.any(String),
      });
    });
  });

  describe('admin surface gates', () => {
    const adminPaths = [
      ['/api/admin/dashboard', 'get'],
      ['/api/admin/analytics', 'get'],
      ['/api/admin/customers', 'get'],
      ['/api/admin/settings', 'get'],
      ['/api/admin/notifications', 'get'],
      ['/api/admin/contact-messages', 'get'],
      ['/api/admin/uploads', 'post'],
      ['/api/admin/products', 'post'],
    ] as const;

    for (const [path, method] of adminPaths) {
      it(`rejects ${method.toUpperCase()} ${path} without a token`, async () => {
        const res = method === 'get'
          ? await agent.get(path)
          : await agent.post(path).send({});
        expect(res.status).toBe(HTTP_STATUS_CODES.Unauthorized);
      });
    }

    it('rejects admin dashboard for a non-admin user', async () => {
      const token = mockAuthCustomer();
      const res = await agent.get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HTTP_STATUS_CODES.Forbidden);
    });
  });

  describe('rate limiting', () => {
    it('throttles repeated sign-in attempts', async () => {
      userMocks.findOne.mockResolvedValue(null as never);

      let lastStatus = 0;
      for (let i = 0; i < 6; i++) {
        const res = await agent.post('/api/auth/signin')
          .send({ email: 'bot@example.com', password: 'wrong-password' });
        lastStatus = res.status;
      }
      // 5 attempts/min allowed — the 6th is throttled.
      expect(lastStatus).toBe(HTTP_STATUS_CODES.TooManyRequests);
    });
  });
});
