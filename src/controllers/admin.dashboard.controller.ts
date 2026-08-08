import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';

import { Order } from '@src/models/order.model';
import { Plant } from '@src/models/plant.model';
import { User } from '@src/models/user.model';
import { AdminNotification } from '@src/models/adminNotification.model';
import { getSettings } from '@src/services/settings.service';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard — headline metrics for the admin home
// ---------------------------------------------------------------------------
export const getDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const settings = await getSettings();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfPrevMonth = new Date(startOfMonth);
    startOfPrevMonth.setMonth(startOfPrevMonth.getMonth() - 1);

    const revenueMatch = { status: { $ne: 'cancelled' } };

    const [
      revenueAgg,
      thisMonthRev,
      prevMonthRev,
      ordersTotal,
      productsTotal,
      customersTotal,
      lowStockCount,
      recentOrders,
      topProducts,
    ] = await Promise.all([
      Order.aggregate<{ _id: null; total: number }>([
        { $match: revenueMatch },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.aggregate<{ _id: null; total: number }>([
        { $match: { ...revenueMatch, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.aggregate<{ _id: null; total: number }>([
        {
          $match: {
            ...revenueMatch,
            createdAt: { $gte: startOfPrevMonth, $lt: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.countDocuments({}),
      Plant.countDocuments({ status: 'active' }),
      User.countDocuments({ role: 'customer' }),
      Plant.countDocuments({
        status: 'active',
        stock: { $lt: settings.lowStockThreshold },
      }),
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('customerName customerEmail items total status createdAt')
        .lean(),
      Plant.find({ status: 'active' })
        .sort({ sold: -1 })
        .limit(5)
        .select('name slug price sold stock imageUrl rating')
        .lean(),
    ]);

    const revenue = revenueAgg[0]?.total ?? 0;
    const thisMonth = thisMonthRev[0]?.total ?? 0;
    const prevMonth = prevMonthRev[0]?.total ?? 0;
    const monthOverMonth =
      prevMonth === 0
        ? (thisMonth > 0 ? 100 : 0)
        : Math.round(((thisMonth - prevMonth) / prevMonth) * 1000) / 10;

    res.json({
      data: {
        metrics: {
          revenue,
          monthOverMonthPct: monthOverMonth,
          orders: ordersTotal,
          products: productsTotal,
          customers: customersTotal,
          lowStockCount,
        },
        recentOrders,
        topProducts,
      },
    });
  } catch (err) { next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/admin/analytics — charts data for the analytics page
// ---------------------------------------------------------------------------
export const getAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [monthly, statusDist, bestBySales, bestByRating] = await Promise.all([
      // Last-6-months revenue buckets (excl. cancelled).
      Order.aggregate<{
        _id: { year: number; month: number };
        revenue: number; orders: number;
      }>([
        { $match: { status: { $ne: 'cancelled' }, createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            revenue: { $sum: '$total' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      Order.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Plant.find({ status: 'active' })
        .sort({ sold: -1 })
        .limit(5)
        .select('name slug sold rating price stock')
        .lean(),
      Plant.find({ status: 'active', ratingCount: { $gt: 0 } })
        .sort({ rating: -1, ratingCount: -1 })
        .limit(5)
        .select('name slug sold rating ratingCount price')
        .lean(),
    ]);

    // Zero-fill months with no orders so charts get a continuous series.
    const buckets: { year: number; month: number; revenue: number; orders: number }[] = [];
    const cursor = new Date(sixMonthsAgo);
    for (let i = 0; i < 6; i++) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth() + 1;
      const found = monthly.find((m) => m._id.year === year && m._id.month === month);
      buckets.push({
        year,
        month,
        revenue: found?.revenue ?? 0,
        orders: found?.orders ?? 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    res.json({
      data: {
        monthlySales: buckets,
        statusDistribution: statusDist.map((s) => ({ status: s._id, count: s.count })),
        bestSellersBySales: bestBySales,
        bestSellersByRating: bestByRating,
      },
    });
  } catch (err) { next(err); }
};

// ---------------------------------------------------------------------------
// GET /api/admin/customers — spend-derived customer list with VIP badges
// ---------------------------------------------------------------------------
export const getCustomers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const settings = await getSettings();
    const pageNum = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const grouped = await Order.aggregate<{
      _id: Types.ObjectId | string | null;
      totalSpend: number;
      ordersCount: number;
      lastOrderAt: Date;
      name: string;
      email: string;
      userDoc?: { createdAt?: Date; name?: string; email?: string }[];
    }>([
      { $match: { status: { $ne: 'cancelled' } } },
      {
        $group: {
          // Registered users group by id; guests group by their email.
          _id: { $ifNull: ['$user', '$customerEmail'] },
          totalSpend: { $sum: '$total' },
          ordersCount: { $sum: 1 },
          lastOrderAt: { $max: '$createdAt' },
          name: { $last: '$customerName' },
          email: { $last: '$customerEmail' },
        },
      },
      { $sort: { totalSpend: -1 } },
      { $skip: (pageNum - 1) * perPage },
      { $limit: perPage },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDoc',
        },
      },
    ]);

    const data = grouped.map((row) => {
      const userDoc = row.userDoc?.[0];
      return {
        id: row._id?.toString() ?? null,
        name: userDoc?.name ?? row.name ?? 'Guest',
        email: userDoc?.email ?? row.email ?? '',
        joinedAt: userDoc?.createdAt ?? null,
        totalSpend: row.totalSpend,
        ordersCount: row.ordersCount,
        lastOrderAt: row.lastOrderAt,
        vip: row.totalSpend > settings.vipThreshold,
      };
    });

    res.json({ data, page: pageNum });
  } catch (err) { next(err); }
};

// ---------------------------------------------------------------------------
// Admin notifications (bell dropdown)
// ---------------------------------------------------------------------------
export const getNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const pageNum = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const [notifications, unreadCount, total] = await Promise.all([
      AdminNotification.find()
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * perPage)
        .limit(perPage)
        .lean(),
      AdminNotification.countDocuments({ readAt: { $exists: false } }),
      AdminNotification.countDocuments({}),
    ]);

    res.json({
      data: notifications,
      unreadCount,
      total,
      page: pageNum,
      pages: Math.ceil(total / perPage),
    });
  } catch (err) { next(err); }
};

export const markNotificationRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const doc = await AdminNotification.findByIdAndUpdate(
      req.params.id,
      { readAt: new Date() },
      { new: true },
    );
    if (!doc) {
      return res.status(HTTP_STATUS_CODES.NotFound)
        .json({ message: 'Notification not found' });
    }
    res.json({ data: doc });
  } catch (err) { next(err); }
};

export const markAllNotificationsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await AdminNotification.updateMany(
      { readAt: { $exists: false } },
      { readAt: new Date() },
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) { next(err); }
};
