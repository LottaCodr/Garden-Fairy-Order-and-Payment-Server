import { Payment } from '@src/models/payment.model';
import { Order } from '@src/models/order.model';
import { sendOrderConfirmation } from '@src/services/mailer.service';

/**
 * Mark a payment (and its order) as successful.
 *
 * Shared by the Flutterwave webhook and the redirect-based verify endpoint;
 * safe to call multiple times for the same tx_ref (idempotent).
 *
 * Returns the updated payment (or null when no payment matches txRef).
 */
export const markPaymentSuccessful = async (
  txRef: string,
  transactionId: string | number,
  rawWebhook?: unknown,
) => {
  const payment = await Payment.findOneAndUpdate(
    { flutterwaveRef: txRef },
    {
      status: 'successful',
      transactionId: String(transactionId),
      paidAt: new Date(),
      ...(rawWebhook !== undefined ? { rawWebhook } : {}),
    },
    { new: true },
  );

  if (!payment) return null;

  const order = await Order.findByIdAndUpdate(
    payment.order,
    {
      'payment.status': 'paid',
      'payment.reference': String(transactionId),
      status: 'paid',
      paidAt: new Date(),
    },
    { new: true },
  );

  // Confirmation email (fire-and-forget; mailer never throws).
  if (order) {
    let recipient = order.customerEmail ?? null;
    if (!recipient && payment.user) {
      const { User } = await import('@src/models/user.model');
      const user = await User.findById(payment.user).select('email');
      recipient = user?.email ?? null;
    }
    if (recipient) {
      void sendOrderConfirmation(recipient, order._id.toString(), order.total);
    }
  }

  return payment;
};

/**
 * Mark a payment as failed (the order keeps its stock reservation until it
 * is cancelled or its payment is retried).
 */
export const markPaymentFailed = async (txRef: string) => {
  return Payment.findOneAndUpdate(
    { flutterwaveRef: txRef, status: { $ne: 'successful' } },
    { status: 'failed' },
    { new: true },
  );
};
