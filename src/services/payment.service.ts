import { Payment } from '@src/models/payment.model';
import { Order } from '@src/models/order.model';

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
) => {
  const payment = await Payment.findOneAndUpdate(
    { flutterwaveRef: txRef },
    {
      status: 'successful',
      transactionId: String(transactionId),
    },
    { new: true },
  );

  if (!payment) return null;

  await Order.findByIdAndUpdate(payment.order, {
    'payment.status': 'paid',
    'payment.reference': String(transactionId),
    status: 'paid',
    paidAt: new Date(),
  });

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
