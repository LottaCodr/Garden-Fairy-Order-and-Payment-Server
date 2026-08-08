import { Request, Response, NextFunction } from 'express';
import { Category } from '../models/category.model';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description } = req.body ?? {};

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'name is required' });
    }

    const slug = slugify(req.body.slug ?? name);
    if (!slug) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'a valid slug could not be derived from the name' });
    }

    const exists = await Category.findOne({ $or: [{ slug }, { name: name.trim() }] });
    if (exists) {
      return res.status(HTTP_STATUS_CODES.Conflict)
        .json({ message: 'A category with this name or slug already exists' });
    }

    const cat = await Category.create({ name: name.trim(), slug, description });
    res.status(HTTP_STATUS_CODES.Created).json({ success: true, data: cat });
  } catch (err) { next(err); }
};

export const listCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cats = await Category.find().sort({ name: 1 });
    res.json({ success: true, data: cats });
  } catch (err) { next(err); }
};

export const getCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cat = await Category.findOne({ slug: req.params.slug });
    if (!cat) {
      return res.status(HTTP_STATUS_CODES.NotFound)
        .json({ message: 'Category not found' });
    }
    res.json({ success: true, data: cat });
  } catch (err) { next(err); }
};

export const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data: Record<string, string> = {};
    if (req.body?.name !== undefined) data.name = String(req.body.name).trim();
    if (req.body?.description !== undefined) data.description = String(req.body.description);
    if (req.body?.slug !== undefined) data.slug = slugify(String(req.body.slug));

    const cat = await Category.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!cat) {
      return res.status(HTTP_STATUS_CODES.NotFound)
        .json({ message: 'Category not found' });
    }
    res.json({ success: true, data: cat });
  } catch (err) { next(err); }
};

export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cat = await Category.findByIdAndDelete(req.params.id);
    if (!cat) {
      return res.status(HTTP_STATUS_CODES.NotFound)
        .json({ message: 'Category not found' });
    }
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) { next(err); }
};
