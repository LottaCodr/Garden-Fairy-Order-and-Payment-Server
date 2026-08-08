import { describe, it, expect, vi, afterEach } from 'vitest';
import { Types } from 'mongoose';

import { Plant } from '@src/models/plant.model';
import { Order } from '@src/models/order.model';
import { Payment } from '@src/models/payment.model';
import {
  reserveStock,
  releaseStock,
  restockOrder,
  cancelOrderAndRestock,
} from '@src/services/order.service';
import {
  markPaymentSuccessful,
  markPaymentFailed,
} from '@src/services/payment.service';

// vi.spyOn replaces properties on the shared model objects themselves, so it
// works for service modules that were imported during setup.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('order service — stock management', () => {
  it('reserveStock decrements stock atomically when enough is available', async () => {
    const spy = vi.spyOn(Plant, 'findOneAndUpdate').mockResolvedValue({} as never);
    await reserveStock('abc', 3);
    expect(spy).toHaveBeenCalledWith(
      { _id: 'abc', stock: { $gte: 3 } },
      { $inc: { stock: -3, sold: 3 } },
      { new: true },
    );
  });

  it('releaseStock returns stock to the catalogue', async () => {
    const spy = vi.spyOn(Plant, 'findOneAndUpdate').mockResolvedValue({} as never);
    await releaseStock('abc', 2);
    expect(spy).toHaveBeenCalledWith(
      { _id: 'abc' },
      { $inc: { stock: 2, sold: -2 } },
      { new: true },
    );
  });

  it('restockOrder releases every item on the order', async () => {
    const spy = vi.spyOn(Plant, 'findOneAndUpdate').mockResolvedValue({} as never);
    await restockOrder({
      items: [
        { product: new Types.ObjectId(), name: 'A', price: 100, qty: 1 },
        { product: new Types.ObjectId(), name: 'B', price: 200, qty: 4 },
        { product: new Types.ObjectId(), name: 'C', price: 300, qty: 2 },
      ],
    });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('cancelOrderAndRestock cancels and restores stock', async () => {
    const fakeOrder = {
      _id: new Types.ObjectId(),
      items: [{ product: new Types.ObjectId(), name: 'Fern', price: 500, qty: 5 }],
    };
    const orderSpy = vi.spyOn(Order, 'findByIdAndUpdate')
      .mockResolvedValue(fakeOrder as never);
    const plantSpy = vi.spyOn(Plant, 'findOneAndUpdate').mockResolvedValue({} as never);

    const result = await cancelOrderAndRestock('some-id');

    expect(orderSpy).toHaveBeenCalledOnce();
    expect(plantSpy).toHaveBeenCalledTimes(1);
    expect(plantSpy).toHaveBeenCalledWith(
      { _id: fakeOrder.items[0].product.toString() },
      { $inc: { stock: 5, sold: -5 } },
      { new: true },
    );
    expect(result).toBe(fakeOrder);
  });
});

describe('payment service', () => {
  it('markPaymentSuccessful updates the payment and the linked order', async () => {
    const orderId = new Types.ObjectId();
    const paymentSpy = vi.spyOn(Payment, 'findOneAndUpdate')
      .mockResolvedValue({ order: orderId } as never);
    const orderSpy = vi.spyOn(Order, 'findByIdAndUpdate').mockResolvedValue({} as never);

    const result = await markPaymentSuccessful('GF-1-123', 98765);

    expect(paymentSpy).toHaveBeenCalledWith(
      { flutterwaveRef: 'GF-1-123' },
      { status: 'successful', transactionId: '98765' },
      { new: true },
    );
    expect(orderSpy).toHaveBeenCalledWith(orderId, expect.objectContaining({
      'payment.status': 'paid',
      'payment.reference': '98765',
      status: 'paid',
    }));
    expect(result).toEqual({ order: orderId });
  });

  it('markPaymentSuccessful does nothing for an unknown tx_ref', async () => {
    vi.spyOn(Payment, 'findOneAndUpdate').mockResolvedValue(null as never);
    const orderSpy = vi.spyOn(Order, 'findByIdAndUpdate');

    const result = await markPaymentSuccessful('nope', 1);

    expect(result).toBeNull();
    expect(orderSpy).not.toHaveBeenCalled();
  });

  it('markPaymentFailed only touches non-successful payments', async () => {
    const spy = vi.spyOn(Payment, 'findOneAndUpdate').mockResolvedValue({} as never);
    await markPaymentFailed('GF-2-999');
    expect(spy).toHaveBeenCalledWith(
      { flutterwaveRef: 'GF-2-999', status: { $ne: 'successful' } },
      { status: 'failed' },
      { new: true },
    );
  });
});
