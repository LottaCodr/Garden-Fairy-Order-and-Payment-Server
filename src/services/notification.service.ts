import {
  AdminNotification,
  NotificationType,
} from '@src/models/adminNotification.model';
import { getSettings } from './settings.service';

/**
 * Admin notifications (bell dropdown). Fire-and-forget: a notification
 * write failure must never break the request that triggered it.
 */
export const notifyAdmins = async (
  type: NotificationType,
  title: string,
  payload: Record<string, unknown> = {},
) => {
  try {
    await AdminNotification.create({ type, title, payload });
  } catch (err) {
    console.error('Failed to create admin notification:', err);
  }
};

export const notifyNewOrder = (orderId: string, total: number, name: string) =>
  notifyAdmins('NEW_ORDER', `New order #${orderId} — ₦${total.toLocaleString()}`, {
    orderId,
    total,
    customerName: name,
  });

/**
 * Raise a LOW_STOCK alert only when the product *crosses* below the
 * configured threshold (avoids notifying on every subsequent sale).
 */
export const maybeNotifyLowStock = async (
  productId: string,
  name: string,
  previousStock: number,
  newStock: number,
) => {
  const settings = await getSettings();
  if (!settings.notifyOnLowStock) return;
  if (previousStock >= settings.lowStockThreshold &&
      newStock < settings.lowStockThreshold) {
    await notifyAdmins(
      'LOW_STOCK',
      `"${name}" is low on stock (${newStock} left)`,
      { productId, stock: newStock, threshold: settings.lowStockThreshold },
    );
  }
};
