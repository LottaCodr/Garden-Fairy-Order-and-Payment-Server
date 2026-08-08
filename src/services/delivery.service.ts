import { DeliveryRate } from '@src/models/deliveryRate.model';
import { getSettings } from './settings.service';

export interface IDeliveryQuote {
  deliveryFee: number;
  etaDays: number | null;
  freeShippingApplied: boolean;
  matchedArea: string | null;
}

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Quote a delivery fee + ETA for a destination.
 *
 * - Free shipping when the subtotal meets the configured threshold
 * - Area-level rate wins over the state-level rate
 * - Falls back to the flat `deliveryFee` setting for unknown destinations
 */
export const quoteDelivery = async (
  state: string,
  city?: string,
  subtotal = 0,
): Promise<IDeliveryQuote> => {
  const settings = await getSettings();

  let rate = null;
  if (city) {
    rate = await DeliveryRate.findOne({
      area: new RegExp(`^${escapeRegex(city.trim())}$`, 'i'),
    });
  }
  if (!rate) {
    rate = await DeliveryRate.findOne({
      state: new RegExp(`^${escapeRegex(state.trim())}$`, 'i'),
    });
  }

  const baseFee = rate ? rate.fee : settings.deliveryFee;
  const freeShippingApplied =
    subtotal > 0 && subtotal >= settings.freeShippingThreshold;

  return {
    deliveryFee: freeShippingApplied ? 0 : baseFee,
    etaDays: rate ? rate.etaDays : null,
    freeShippingApplied,
    matchedArea: rate?.area ?? null,
  };
};
