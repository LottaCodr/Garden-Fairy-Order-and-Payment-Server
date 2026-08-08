import { Request, Response, NextFunction } from 'express';

import { NewsletterSubscriber } from '@src/models/newsletterSubscriber.model';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseEmail = (raw: unknown): string | null =>
  typeof raw === 'string' && EMAIL_RE.test(raw.trim())
    ? raw.trim().toLowerCase()
    : null;

/**
 * POST /api/newsletter/subscribe — footer form. Idempotent: a previously
 * unsubscribed email is resubscribed; duplicates are a no-op.
 */
export const subscribe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = parseEmail(req.body?.email);
    if (!email) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'a valid email is required' });
    }

    const existing = await NewsletterSubscriber.findOne({ email });
    if (existing && !existing.unsubscribedAt) {
      return res.json({ message: 'You are already subscribed' });
    }

    if (existing) {
      existing.subscribedAt = new Date();
      existing.unsubscribedAt = undefined;
      await existing.save();
    } else {
      await NewsletterSubscriber.create({ email });
    }

    res.status(HTTP_STATUS_CODES.Created).json({ message: 'Subscribed successfully' });
  } catch (err) { next(err); }
};

/**
 * POST /api/newsletter/unsubscribe — honor the footer unsubscribe/undo flow.
 */
export const unsubscribe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = parseEmail(req.body?.email);
    if (!email) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'a valid email is required' });
    }

    const existing = await NewsletterSubscriber.findOne({ email });
    if (!existing || existing.unsubscribedAt) {
      return res.status(HTTP_STATUS_CODES.NotFound)
        .json({ message: 'That email is not subscribed' });
    }

    existing.unsubscribedAt = new Date();
    await existing.save();

    res.json({ message: 'Unsubscribed successfully' });
  } catch (err) { next(err); }
};
