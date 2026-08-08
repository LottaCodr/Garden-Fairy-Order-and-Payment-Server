import { Request, Response, NextFunction } from 'express';

import { WishlistItem } from '@src/models/wishlistItem.model';
import { Plant } from '@src/models/plant.model';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

/**
 * GET /api/wishlist — the user's wishlist with product details embedded.
 */
export const getWishlist = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const items = await WishlistItem.find({ user: req.user!.id })
      .populate({
        path: 'product',
        select: 'name slug price compareAtPrice imageUrl stock rating sold status',
        match: { status: { $ne: 'archived' } },
      })
      .sort({ createdAt: -1 })
      .lean();

    // Drop entries whose product was archived since they were wishlisted.
    const data = items.filter((it) => it.product);
    res.json({ data });
  } catch (err) { next(err); }
};

/**
 * POST /api/wishlist/:productId — add to wishlist (idempotent).
 */
export const addToWishlist = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { productId } = req.params;

    const product = await Plant.findById(productId);
    if (!product || product.status === 'archived') {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Product not found' });
    }

    const existing = await WishlistItem.findOne({
      user: req.user!.id,
      product: product._id,
    });
    if (existing) {
      return res.json({ data: existing, message: 'Already in wishlist' });
    }

    const item = await WishlistItem.create({
      user: req.user!.id,
      product: product._id,
    });
    res.status(HTTP_STATUS_CODES.Created).json({ data: item });
  } catch (err) { next(err); }
};

/**
 * DELETE /api/wishlist/:productId — remove from wishlist (idempotent).
 */
export const removeFromWishlist = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await WishlistItem.findOneAndDelete({
      user: req.user!.id,
      product: req.params.productId,
    });
    res.json({ message: 'Removed from wishlist' });
  } catch (err) { next(err); }
};
