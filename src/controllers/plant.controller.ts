import { Request, Response, NextFunction } from 'express';
import { Plant } from '../models/plant.model';
import { uploadToCloudinary } from '@src/utils/cloudinary-upload';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

// Upload req.files to Cloudinary and return an array of { url, publicId }
const uploadImages = async (files: Express.Multer.File[]) => {
  return Promise.all(
    files.map((file) => uploadToCloudinary(file.buffer, 'plantstore/products')),
  );
};

// create with images (admin)
export const createPlant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const imageUrl = await uploadImages(files);
    const payload = { ...req.body, imageUrl };
    const plant = await Plant.create(payload);
    res.status(HTTP_STATUS_CODES.Created).json({ success: true, data: plant });
  } catch (err) {
    next(err);
  }
};

// list plants with search, filters, sorting and pagination
export const getPlants = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      q,
      category,
      minPrice,
      maxPrice,
      sunlight,
      petFriendly,
      page = '1',
      limit = '12',
      sort,
    } = req.query as Record<string, string | undefined>;

    const filter: Record<string, unknown> = {};

    if (q) filter.name = { $regex: q, $options: 'i' };
    if (category) filter.category = category;
    if (sunlight) filter['care.sunlight'] = sunlight;
    if (petFriendly === 'true') filter.tags = { $in: ['pet-friendly'] };

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

    const [items, total] = await Promise.all([
      Plant.find(filter)
        .populate('category', 'name slug')
        .sort(sortObj)
        .skip(skip)
        .limit(perPage)
        .lean(),
      Plant.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
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
    const plant = await Plant.findById(req.params.id).populate('category', 'name slug');
    if (!plant) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Plant not found' });
    }
    res.json({ success: true, data: plant });
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

// update with optional new images (admin)
export const updatePlant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const imageUrl = await uploadImages(files);
    const data: Record<string, unknown> = { ...req.body };
    if (imageUrl.length) data.imageUrl = imageUrl;

    const plant = await Plant.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!plant) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Plant not found' });
    }
    res.json({ success: true, data: plant });
  } catch (err) {
    next(err);
  }
};

export const deletePlant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plant = await Plant.findByIdAndDelete(req.params.id);
    if (!plant) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Plant not found' });
    }
    res.json({ success: true, message: 'Plant deleted' });
  } catch (err) {
    next(err);
  }
};
