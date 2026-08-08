import { Plant } from '@src/models/plant.model';
import { Request, Response, NextFunction } from 'express';
import { uploadToCloudinary } from '@src/utils/cloudinary-upload';

// Upload req.files to Cloudinary and return an array of { url, publicId }
const uploadImages = async (files: Express.Multer.File[]) => {
  return Promise.all(
    files.map(file => uploadToCloudinary(file.buffer, 'plantstore/products')),
  );
};

// create with images (admin)
export const createPlant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const imageUrl = await uploadImages(files);
    const payload = { ...req.body, imageUrl };
    const plant = await Plant.create(payload);
    res.status(201).json({ data: plant });
  } catch (err) { next(err); }
};

// update images support
export const updatePlant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const imageUrl = await uploadImages(files);
    const data: Record<string, unknown> = { ...req.body };
    if (imageUrl.length) data.imageUrl = imageUrl;
    const plant = await Plant.findByIdAndUpdate(req.params.id, data, { new: true });
    res.json({ data: plant });
  } catch (err) { next(err); }
};

// get all plants
export const getPlants = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plants = await Plant.find();
    res.json({ data: plants });
  } catch (err) { next(err); }
};

// get plant by id
export const getPlant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plant = await Plant.findById(req.params.id);
    if (!plant) {
      return res.status(404).json({ message: 'Plant not found' });
    }
    res.json({ data: plant });
  } catch (err) { next(err); }
};

// delete plant by id
export const deletePlant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plant = await Plant.findByIdAndDelete(req.params.id);
    if (!plant) {
      return res.status(404).json({ message: 'Plant not found' });
    }
    res.json({ message: 'Plant deleted successfully' });
  } catch (err) { next(err); }
};
