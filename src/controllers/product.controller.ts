import { Plant } from "@src/models/plant.model";
import { Request, Response, NextFunction } from "express";

// create with images (admin)
export const createPlant = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // if files come as req.files (multer)
        const files = (req.files as Express.Multer.File[]) || [];
        const imageUrls = files.map(f => (f as any).path || (f as any).secure_url || (f as any).location);
        const payload = { ...req.body, images: imageUrls };
        const plant = await Plant.create(payload);
        res.status(201).json({ data: plant });
    } catch (err) { next(err); }
};

// update images support
export const updatePlant = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const files = (req.files as Express.Multer.File[]) || [];
        const imageUrls = files.map(f => (f as any).path || (f as any).secure_url || (f as any).location);
        const data: any = { ...req.body };
        if (imageUrls.length) data.images = imageUrls;
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
            return res.status(404).json({ message: "Plant not found" });
        }
        res.json({ data: plant });
    } catch (err) { next(err); }
};

// delete plant by id
export const deletePlant = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const plant = await Plant.findByIdAndDelete(req.params.id);
        if (!plant) {
            return res.status(404).json({ message: "Plant not found" });
        }
        res.json({ message: "Plant deleted successfully" });
    } catch (err) { next(err); }
};
