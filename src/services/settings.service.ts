import { StoreSetting } from '@src/models/storeSetting.model';

/**
 * Store settings — persisted overrides of these defaults, editable via
 * PUT /api/admin/settings. Business rules (free shipping threshold etc.)
 * read from here, never from hardcoded constants.
 */
export const SETTING_KEYS = [
  'storeName',
  'supportEmail',
  'phone',
  'deliveryFee',
  'freeShippingThreshold',
  'lowStockThreshold',
  'vipThreshold',
  'paymentProvider',
  'notifyOnNewOrder',
  'notifyOnLowStock',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export interface IStoreSettings {
  storeName: string;
  supportEmail: string;
  phone: string;
  deliveryFee: number;            // fallback flat fee (₦) when no rate found
  freeShippingThreshold: number;  // ₦ — free delivery above this subtotal
  lowStockThreshold: number;      // products under this count raise alerts
  vipThreshold: number;           // ₦ — customers above this are VIP
  paymentProvider: string;        // flutterwave | paystack
  notifyOnNewOrder: boolean;
  notifyOnLowStock: boolean;
}

export const DEFAULT_SETTINGS: IStoreSettings = {
  storeName: 'The Garden Fairy',
  supportEmail: 'support@gardenfairy.ng',
  phone: '+234 000 000 0000',
  deliveryFee: 3500,
  freeShippingThreshold: 50000,
  lowStockThreshold: 5,
  vipThreshold: 20000,
  paymentProvider: 'flutterwave',
  notifyOnNewOrder: true,
  notifyOnLowStock: true,
};

const CACHE_TTL_MS = 60_000;
let cache: { at: number; settings: IStoreSettings } | null = null;

export const clearSettingsCache = () => {
  cache = null;
};

/**
 * Load all settings (defaults merged with persisted values, 60s cache).
 */
export const getSettings = async (): Promise<IStoreSettings> => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.settings;
  }
  const docs = await StoreSetting.find().lean();
  const settings = { ...DEFAULT_SETTINGS };
  for (const doc of docs) {
    const key = doc.key as SettingKey;
    if (key in settings && doc.value !== undefined) {
      (settings as Record<string, unknown>)[key] = doc.value;
    }
  }
  cache = { at: Date.now(), settings };
  return settings;
};

/**
 * Persist a settings patch (upsert per key) and invalidate the cache.
 */
export const updateSettings = async (
  patch: Partial<IStoreSettings>,
): Promise<IStoreSettings> => {
  await Promise.all(
    Object.entries(patch).map(([key, value]) =>
      StoreSetting.findOneAndUpdate(
        { key },
        { key, value },
        { upsert: true, new: true },
      )),
  );
  clearSettingsCache();
  return getSettings();
};
