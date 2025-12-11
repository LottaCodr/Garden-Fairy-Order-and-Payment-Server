import { Request, Response, NextFunction } from "express";
import { Category } from "../models/category.model";

export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cat = await Category.create(req.body);
        res.status(201).json({ data: cat });
    } catch (err) { next(err); }
};

export const listCategories = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cats = await Category.find();
        res.json({ data: cats });
    } catch (err) { next(err); }
};
