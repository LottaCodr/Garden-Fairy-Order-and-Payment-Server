import { Request, Response, NextFunction } from 'express';

import {
  ContactMessage,
  CONTACT_STATUSES,
  ContactStatus,
} from '@src/models/contactMessage.model';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/contact — persist a contact message (footer/support form).
 */
export const submitContact = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, email, subject, message } = req.body ?? {};

    const errors: string[] = [];
    if (typeof name !== 'string' || !name.trim()) errors.push('name is required');
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      errors.push('a valid email is required');
    }
    if (typeof subject !== 'string' || !subject.trim()) {
      errors.push('subject is required');
    }
    if (typeof message !== 'string' || !message.trim()) {
      errors.push('message is required');
    }
    if (errors.length) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ message: errors.join('; ') });
    }

    const doc = await ContactMessage.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim(),
    });

    res.status(HTTP_STATUS_CODES.Created).json({
      message: 'Message received — we will get back to you shortly',
      id: doc._id,
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/admin/contact-messages — inbox for the admin panel.
 */
export const listContactMessages = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status } = req.query as { status?: string };
    const pageNum = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (pageNum - 1) * perPage;

    const filter: Record<string, unknown> = {};
    if (status) {
      if (!CONTACT_STATUSES.includes(status as ContactStatus)) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({
          message: `status must be one of: ${CONTACT_STATUSES.join(', ')}`,
        });
      }
      filter.status = status;
    }

    const [messages, total] = await Promise.all([
      ContactMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage),
      ContactMessage.countDocuments(filter),
    ]);

    res.json({
      data: messages,
      total,
      page: pageNum,
      pages: Math.ceil(total / perPage),
    });
  } catch (err) { next(err); }
};

/**
 * PATCH /api/admin/contact-messages/:id — update inbox status.
 */
export const updateContactMessage = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status } = req.body ?? {};
    if (!CONTACT_STATUSES.includes(status as ContactStatus)) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({
        message: `status must be one of: ${CONTACT_STATUSES.join(', ')}`,
      });
    }

    const doc = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );
    if (!doc) {
      return res.status(HTTP_STATUS_CODES.NotFound)
        .json({ message: 'Message not found' });
    }
    res.json({ data: doc });
  } catch (err) { next(err); }
};
