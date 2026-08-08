import { Request, Response, NextFunction } from 'express';
import { Plant } from '../models/plant.model';
import { InventoryLog } from '@src/models/inventoryLog.model';
import { uploadToCloudinary } from '@src/utils/cloudinary-upload';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

// Upload req.files to Cloudinary and return an array of { url, publicId }
const uploadImages = async (files: Express.Multer.File[]) => {
  return Promise.all(
    files.map((file) => uploadToCloudinary(file.buffer, 'plantstore/products')),
  );
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

/** Ensure slug uniqueness by suffixing when necessary. */
const uniqueSlug = async (base: string) => {
  const root = slugify(base) || 'plant';
  let slug = root;
  let attempt = 2;
  while (await Plant.exists({ slug })) {
    slug = `${root}-${attempt++}`;
  }
  return slug;
};

const generateSku = () =>
  `GF-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0')}`;

/** Attach the flat `images: string[]` shape the storefront consumes. */
const withImagesArray = <T extends { imageUrl?: { url: string }[] }>(doc: T) => ({
  ...doc,
  images: (doc.imageUrl ?? []).map((img) => img.url),
});

// create with images (admin) — auto-generates slug + sku
export const createPlant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const imageUrl = await uploadImages(files);
    const payload = { ...req.body, imageUrl };

    if (!payload.slug && payload.name) {
      payload.slug = await uniqueSlug(String(payload.name));
    }
    if (!payload.sku) payload.sku = generateSku();

    const plant = await Plant.create(payload);
    res.status(HTTP_STATUS_CODES.Created).json({ success: true, data: plant });
  } catch (err) {
    next(err);
  }
};

// List products with search, filters, sorting and pagination.
// Public callers never see archived products; admins may opt in with
// ?include_archived=true (mounted at both /api/plants and /api/products).
export const getPlants = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      q,
      category,
      minPrice,
      maxPrice,
      sunlight,
      petFriendly,
      premium,
      status,
      include_archived,
      page = '1',
      limit = '12',
      sort,
    } = req.query as Record<string, string | undefined>;

    const isAdmin = req.user?.role === 'admin';
    const filter: Record<string, unknown> = {};

    const wantsArchived =
      isAdmin && (include_archived === 'true' || status === 'archived');
    filter.status = wantsArchived ? 'archived' : 'active';

    if (q) filter.name = { $regex: q, $options: 'i' };
    if (category) filter.category = category;
    if (sunlight) filter['care.sunlight'] = sunlight;
    if (petFriendly === 'true') filter.tags = { $in: ['pet-friendly'] };
    if (premium === '1' || premium === 'true') filter.isPremium = true;

    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceFilter: Record<string, number> = {};
      if (minPrice !== undefined) {
        const min = Number(minPrice);
        if (Number.isNaN(min)) {
          return res.status(HTTP_STATUS_CODES.BadRequest)
            .json({ message: 'minPrice must be a number' });
        }
        priceFilter.$gte = min;
      }
      if (maxPrice !== undefined) {
        const max = Number(maxPrice);
        if (Number.isNaN(max)) {
          return res.status(HTTP_STATUS_CODES.BadRequest)
            .json({ message: 'maxPrice must be a number' });
        }
        priceFilter.$lte = max;
      }
      filter.price = priceFilter;
    }

    // pagination
    const pageNum = Math.max(1, Number(page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(limit) || 12));
    const skip = (pageNum - 1) * perPage;

    // sorting
    let sortObj: Record<string, 1 | -1> = { createdAt: -1 };
    if (sort === 'price_asc') sortObj = { price: 1 };
    if (sort === 'price_desc') sortObj = { price: -1 };
    if (sort === 'popular') sortObj = { sold: -1 };
    if (sort === 'name_asc') sortObj = { name: 1 };
    if (sort === 'rating') sortObj = { rating: -1 };

    const [items, total] = await Promise.all([
      Plant.find(filter)
        .populate('category', 'name slug icon')
        .sort(sortObj)
        .skip(skip)
        .limit(perPage)
        .lean(),
      Plant.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items.map(withImagesArray),
      total,
      page: pageNum,
      pages: Math.ceil(total / perPage),
    });
  } catch (err) {
    next(err);
  }
};

export const getPlant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Accept id or slug in the :id slot.
    const { id } = req.params;
    const query = /^[0-9a-fA-F]{24}$/.test(id)
      ? Plant.findById(id)
      : Plant.findOne({ slug: id });

    const plant = await query.populate('category', 'name slug icon');
    if (!plant) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Plant not found' });
    }
    // Archived products are only visible to admins.
    if (plant.status === 'archived' && req.user?.role !== 'admin') {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Plant not found' });
    }
    res.json({ success: true, data: withImagesArray(plant.toObject()) });
  } catch (err) {
    next(err);
  }
};

export const uploadPlantImages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { plantId } = req.params;

    if (!req.files || !(req.files instanceof Array) || !req.files.length) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ message: 'No images provided' });
    }

    const uploadPromises = req.files.map((file) =>
      uploadToCloudinary(file.buffer),
    );

    const imageUrls = await Promise.all(uploadPromises);

    const plant = await Plant.findByIdAndUpdate(
      plantId,
      { $push: { imageUrl: { $each: imageUrls } } },
      { new: true },
    );

    if (!plant) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Plant not found' });
    }

    res.status(HTTP_STATUS_CODES.Ok).json({
      message: 'Images uploaded successfully',
      images: plant.imageUrl,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Standalone admin image upload (POST /api/admin/uploads).
 * Returns CDN URLs for the product form's "Image URL" field.
 */
export const uploadImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = ((req.files as Express.Multer.File[]) || [])
      .concat(req.file ? [req.file] : []);

    if (!files.length) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ message: 'No file provided' });
    }

    const uploads = await Promise.all(
      files.map((file) => uploadToCloudinary(file.buffer, 'plantstore/uploads')),
    );

    res.status(HTTP_STATUS_CODES.Created).json({
      data: uploads.length === 1 ? uploads[0] : uploads,
    });
  } catch (err) {
    next(err);
  }
};

// update with optional new images (admin); stock changes write InventoryLogs
export const updatePlant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const imageUrl = await uploadImages(files);
    const data: Record<string, unknown> = { ...req.body };
    if (imageUrl.length) data.imageUrl = imageUrl;
    delete data.slug; // slugs are immutable once issued

    const before = await Plant.findById(req.params.id).select('stock status');
    if (!before) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Plant not found' });
    }

    const plant = await Plant.findByIdAndUpdate(req.params.id, data, { new: true });

    // Audit stock adjustments made through the admin panel.
    const newStock = data.stock !== undefined ? Number(data.stock) : undefined;
    if (newStock !== undefined && !Number.isNaN(newStock) && newStock !== before.stock) {
      try {
        await InventoryLog.create({
          product: plant!._id,
          delta: newStock - before.stock,
          reason: 'adjustment',
        });
      } catch (logErr) {
        console.error('Failed to write inventory log:', logErr);
      }
    }

    res.json({ success: true, data: plant });
  } catch (err) {
    next(err);
  }
};

// Soft-delete (archive) so past orders keep their product snapshot.
// ?permanent=true performs a hard delete.
export const deletePlant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.query.permanent === 'true') {
      const plant = await Plant.findByIdAndDelete(req.params.id);
      if (!plant) {
        return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Plant not found' });
      }
      return res.json({ success: true, message: 'Plant deleted' });
    }

    const plant = await Plant.findByIdAndUpdate(
      req.params.id,
      { status: 'archived' },
      { new: true },
    );
    if (!plant) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Plant not found' });
    }
    res.json({ success: true, message: 'Plant archived' });
  } catch (err) {
    next(err);
  }
};
