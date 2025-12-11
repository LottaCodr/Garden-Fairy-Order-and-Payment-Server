import { Request, Response, NextFunction } from "express";
import { Plant } from "../models/plant.model";

export const createPlant = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const plant = await Plant.create(req.body);
        res.status(201).json({ success: true, data: plant });
    } catch (err) {
        next(err);
    }
};

export const getPlants = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            q,
            category,
            minPrice,
            maxPrice,
            sunlight,
            petFriendly,
            page = "1",
            limit = "12",
            sort
        } = req.query as any;

        const filter: any = {};

        if (q) filter.name = { $regex: q, $options: "i" };
        if (category) filter.category = category;
        if (sunlight) filter["care.sunlight"] = sunlight;
        if (petFriendly) filter.tags = { $in: ["pet-friendly"] };
        if (minPrice || maxPrice) filter.price = {};
        if (minPrice) filter.price.$gte = Number(minPrice);
        if (maxPrice) filter.price.$lte = Number(maxPrice);

        // pagination
        const pageNum = Math.max(1, Number(page));
        const perPage = Math.max(1, Number(limit));
        const skip = (pageNum - 1) * perPage;

        // sorting
        let sortObj: any = { createdAt: -1 };
        if (sort === "price_asc") sortObj = { price: 1 };
        if (sort === "price_desc") sortObj = { price: -1 };
        if (sort === "popular") sortObj = { sold: -1 };

        const [items, total] = await Promise.all([
            Plant.find(filter).sort(sortObj).skip(skip).limit(perPage).lean(),
            Plant.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: items,
            total,
            page: pageNum,
            pages: Math.ceil(total / perPage)
        });
    } catch (err) {
        next(err);
    }
};

export const getPlant = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const plant = await Plant.findById(req.params.id);
        if (!plant) return res.status(404).json({ message: "Plant not found" });
        res.json({ success: true, data: plant });
    } catch (err) {
        next(err);
    }
};

export const updatePlant = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const plant = await Plant.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: plant });
    } catch (err) {
        next(err);
    }
};

export const deletePlant = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await Plant.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Plant deleted" });
    } catch (err) {
        next(err);
    }
};
