import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';

import { Review } from '@src/models/review.model';
import { Plant } from '@src/models/plant.model';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

/**
 * Recompute and persist a product's aggregate rating fields.
 */
const recomputeProductRating = async (productId: string) => {
  const stats = await Review.aggregate<{
    _id: null; avg: number; count: number;
  }>([
    { $match: { product: new Types.ObjectId(productId) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const { avg, count } = stats[0] ?? { avg: 0, count: 0 };
  await Plant.findByIdAndUpdate(productId, {
    rating: Math.round(avg * 10) / 10,
    ratingCount: count,
  });
};

/**
 * GET /api/products/:id/reviews (also mounted under /api/plants/:id).
 * Query: page, limit.
 */
export const listReviews = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const productId = req.params.id;
    const pageNum = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (pageNum - 1) * perPage;

    const [reviews, total] = await Promise.all([
      Review.find({ product: productId })
        .populate('user', 'name avatarUrl')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      Review.countDocuments({ product: productId }),
    ]);

    res.json({
      data: reviews,
      total,
      page: pageNum,
      pages: Math.ceil(total / perPage),
    });
  } catch (err) { next(err); }
};

/**
 * POST /api/products/:id/reviews — create or update the caller's review
 * (one per user per product). Body: { rating: 1-5, comment? }
 */
export const upsertReview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const productId = req.params.id;
    const { rating, comment } = req.body ?? {};

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'rating must be an integer between 1 and 5' });
    }
    if (comment !== undefined && typeof comment !== 'string') {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'comment must be a string' });
    }

    const product = await Plant.findById(productId);
    if (!product || product.status === 'archived') {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Product not found' });
    }

    const review = await Review.findOneAndUpdate(
      { product: product._id, user: req.user!.id },
      { rating: ratingNum, comment },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    await recomputeProductRating(productId);

    res.status(HTTP_STATUS_CODES.Created).json({ data: review });
  } catch (err) { next(err); }
};

/**
 * DELETE /api/reviews/:id — remove a review (owner or admin).
 */
export const deleteReview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Review not found' });
    }

    const isOwner = review.user.toString() === req.user!.id;
    if (!isOwner && req.user!.role !== 'admin') {
      return res.status(HTTP_STATUS_CODES.Forbidden)
        .json({ message: 'You can only delete your own reviews' });
    }

    const productId = review.product.toString();
    await review.deleteOne();
    await recomputeProductRating(productId);

    res.json({ message: 'Review deleted' });
  } catch (err) { next(err); }
};
