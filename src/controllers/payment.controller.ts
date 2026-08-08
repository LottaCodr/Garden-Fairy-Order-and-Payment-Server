import { Order } from '../models/order.model';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import flwClient from '@src/services/flutterwave.service';
import { Payment } from '@src/models/payment.model';
import {
  markPaymentSuccessful,
  markPaymentFailed,
} from '@src/services/payment.service';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

const FLW_REDIRECT = process.env.FLUTTERWAVE_REDIRECT_URL;

/**
 * Initialize (or re-initialize) a Flutterwave hosted payment for an order.
 * The amount always comes from the order record — never the client.
 */
export const initializePayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { orderId } = req.body ?? {};
    const user = req.user!;

    if (typeof orderId !== 'string' || !orderId) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'orderId is required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(HTTP_STATUS_CODES.NotFound)
        .json({ message: 'Order not found' });
    }

    // Only the order owner (or an admin) may pay for it.
    const isOwner = order.user?.toString() === user.id;
    if (!isOwner && user.role !== 'admin') {
      return res.status(HTTP_STATUS_CODES.Forbidden)
        .json({ message: 'You do not have access to this order' });
    }
    if (order.payment?.status === 'paid') {
      return res.status(HTTP_STATUS_CODES.Conflict)
        .json({ message: 'Order has already been paid' });
    }
    if (order.status === 'cancelled') {
      return res.status(HTTP_STATUS_CODES.Conflict)
        .json({ message: 'Order has been cancelled' });
    }

    const idempotencyKey =
      req.headers['idempotency-key']?.toString() ||
      crypto.randomUUID();

    // Replay a previously created, still-pending payment for the same key.
    const existing = await Payment.findOne({ idempotencyKey });
    if (existing) {
      return res.json({
        txRef: existing.flutterwaveRef,
        paymentLink: undefined,
        message: 'Payment already initialized',
      });
    }

    const txRef = `GF-${order._id.toString()}-${Date.now()}`;

    // Amount is authoritative from the order — never trust the request body.
    const payment = await Payment.create({
      user: user.id,
      order: order._id,
      amount: order.total,
      flutterwaveRef: txRef,
      idempotencyKey,
    });

    try {
      const response = await flwClient.post('/payments', {
        tx_ref: txRef,
        amount: order.total,
        currency: 'NGN',
        redirect_url: FLW_REDIRECT,
        customer: {
          email: user.email,
          name: user.name,
          phonenumber: user.phone,
        },
        meta: { orderId: order._id.toString(), paymentId: payment._id.toString() },
        customizations: {
          title: 'Garden Fairy',
          description: 'Plant Purchase',
        },
      });

      return res.status(HTTP_STATUS_CODES.Ok).json({
        txRef,
        paymentLink: response.data?.data?.link,
      });
    } catch (err) {
      // Roll the payment record back so the client can retry cleanly.
      await Payment.findByIdAndDelete(payment._id);
      next(err);
      return;
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Verify a payment after Flutterwave redirects the customer back.
 * GET /api/payments/verify/:txRef
 *
 * Confirms the transaction directly with Flutterwave (the webhook may be
 * delayed or unreachable in development) and syncs Payment/Order state.
 */
export const verifyPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { txRef } = req.params;
    const user = req.user!;

    const payment = await Payment.findOne({ flutterwaveRef: txRef });
    if (!payment) {
      return res.status(HTTP_STATUS_CODES.NotFound)
        .json({ message: 'Payment not found' });
    }

    const isOwner = payment.user.toString() === user.id;
    if (!isOwner && user.role !== 'admin') {
      return res.status(HTTP_STATUS_CODES.Forbidden)
        .json({ message: 'You do not have access to this payment' });
    }

    // Nothing to do if it already resolved.
    if (payment.status === 'successful') {
      return res.json({ status: 'successful', payment });
    }

    const verify = await flwClient.get('/transactions/verify_by_txref', {
      params: { tx_ref: txRef },
    });

    const data = verify.data?.data;

    if (
      data?.status === 'successful' &&
      Number(data.charged_amount ?? data.amount) >= payment.amount &&
      data.currency === 'NGN'
    ) {
      const updated = await markPaymentSuccessful(txRef, data.id);
      return res.json({ status: 'successful', payment: updated });
    }

    if (data?.status === 'failed') {
      await markPaymentFailed(txRef);
      return res.json({ status: 'failed', payment: await Payment.findById(payment._id) });
    }

    // Still pending/processing at the provider.
    return res.json({ status: data?.status ?? 'pending', payment });
  } catch (err) {
    next(err);
  }
};
