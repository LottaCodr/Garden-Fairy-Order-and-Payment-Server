import { Request, Response, NextFunction } from 'express';

import {
  getSettings,
  updateSettings,
  IStoreSettings,
  SETTING_KEYS,
} from '@src/services/settings.service';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

// Settings the public storefront is allowed to read.
const PUBLIC_KEYS: (keyof IStoreSettings)[] = [
  'storeName',
  'supportEmail',
  'phone',
  'deliveryFee',
  'freeShippingThreshold',
  'paymentProvider',
];

const pickPublic = (settings: IStoreSettings) =>
  Object.fromEntries(PUBLIC_KEYS.map((k) => [k, settings[k]]));

/** GET /api/settings — public storefront settings. */
export const getPublicSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json({ data: pickPublic(await getSettings()) });
  } catch (err) { next(err); }
};

/** GET /api/admin/settings — full settings (admin). */
export const getAdminSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json({ data: await getSettings() });
  } catch (err) { next(err); }
};

const NUMBER_KEYS: (keyof IStoreSettings)[] = [
  'deliveryFee',
  'freeShippingThreshold',
  'lowStockThreshold',
  'vipThreshold',
];
const BOOLEAN_KEYS: (keyof IStoreSettings)[] = [
  'notifyOnNewOrder',
  'notifyOnLowStock',
];
const STRING_KEYS: (keyof IStoreSettings)[] = [
  'storeName',
  'supportEmail',
  'phone',
  'paymentProvider',
];

/**
 * PUT /api/admin/settings — persist the settings form. Only known keys are
 * accepted, with per-type coercion + validation.
 */
export const putAdminSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const body = req.body ?? {};
    const patch: Partial<IStoreSettings> = {};

    for (const key of Object.keys(body)) {
      if (!(SETTING_KEYS as readonly string[]).includes(key)) continue;

      if (NUMBER_KEYS.includes(key as keyof IStoreSettings)) {
        const value = Number(body[key]);
        if (Number.isNaN(value) || value < 0) {
          return res.status(HTTP_STATUS_CODES.BadRequest)
            .json({ message: `${key} must be a non-negative number` });
        }
        (patch as Record<string, unknown>)[key] = value;
      } else if (BOOLEAN_KEYS.includes(key as keyof IStoreSettings)) {
        if (typeof body[key] !== 'boolean') {
          return res.status(HTTP_STATUS_CODES.BadRequest)
            .json({ message: `${key} must be a boolean` });
        }
        (patch as Record<string, unknown>)[key] = body[key];
      } else if (STRING_KEYS.includes(key as keyof IStoreSettings)) {
        if (typeof body[key] !== 'string' || !body[key].trim()) {
          return res.status(HTTP_STATUS_CODES.BadRequest)
            .json({ message: `${key} must be a non-empty string` });
        }
        if (key === 'paymentProvider' &&
            !['flutterwave', 'paystack'].includes(body[key])) {
          return res.status(HTTP_STATUS_CODES.BadRequest)
            .json({ message: 'paymentProvider must be flutterwave or paystack' });
        }
        (patch as Record<string, unknown>)[key] = body[key].trim();
      }
    }

    if (!Object.keys(patch).length) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'no valid settings keys provided' });
    }

    const settings = await updateSettings(patch);
    res.json({ data: settings, message: 'Settings saved' });
  } catch (err) { next(err); }
};
