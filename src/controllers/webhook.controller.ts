import { Request, Response } from 'express';
import crypto from 'crypto';
import flwClient from '@src/services/flutterwave.service';
import { Payment } from '@src/models/payment.model';
import {
  markPaymentSuccessful,
  markPaymentFailed,
} from '@src/services/payment.service';

const FLW_CURRENCY = 'NGN';

/**
 * Verify the webhook authenticity.
 *
 * Supports both the official Flutterwave scheme — the `verif-hash` header
 * must equal the secret hash configured in the Flutterwave dashboard — and
 * the legacy scheme used by this codebase (HMAC-SHA256 of the raw body with
 * the secret, sent in the `verify-hash` header).
 */
const isAuthentic = (req: Request, secret: string): boolean => {
  const verifHash = req.headers['verif-hash'];
  if (typeof verifHash === 'string' && verifHash) {
    if (verifHash.length !== secret.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(verifHash),
      Buffer.from(secret),
    );
  }

  const verifyHash = req.headers['verify-hash'];
  if (typeof verifyHash === 'string' && verifyHash) {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (hash.length !== verifyHash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(verifyHash));
  }

  return false;
};

export const flutterwaveWebhook = async (req: Request, res: Response) => {
  try {
    const secret = process.env.FLW_WEBHOOK_SECRET;

    // Without a configured webhook secret we cannot verify the signature.
    if (!secret || !isAuthentic(req, secret)) {
      return res.status(401).send('Invalid signature');
    }

    if (!req.body?.data) {
      return res.status(400).send('Missing webhook payload');
    }

    const { tx_ref, status, id } = req.body.data;

    if (!tx_ref) {
      return res.status(400).send('Missing tx_ref');
    }

    if (status === 'failed') {
      await markPaymentFailed(tx_ref);
      return res.sendStatus(200);
    }

    if (status !== 'successful') return res.sendStatus(200);

    const payment = await Payment.findOne({ flutterwaveRef: tx_ref });

    // Unknown payment or already processed — acknowledge either way so the
    // provider stops retrying.
    if (!payment) {
      console.error(`Webhook received for unknown tx_ref: ${tx_ref}`);
      return res.sendStatus(200);
    }
    if (payment.status === 'successful') {
      return res.sendStatus(200);
    }

    // Confirm the transaction directly with Flutterwave; never trust webhook
    // bodies alone.
    const verify = await flwClient.get(`/transactions/${id}/verify`);
    const data = verify.data?.data;

    if (
      data?.status === 'successful' &&
      Number(data.charged_amount ?? data.amount) >= payment.amount &&
      data.currency === FLW_CURRENCY
    ) {
      await markPaymentSuccessful(tx_ref, data.id ?? id, req.body.data);
    } else if (data?.status === 'failed') {
      await markPaymentFailed(tx_ref);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing Flutterwave webhook:', error);
    res.status(500).send('Webhook processing failed');
  }
};
