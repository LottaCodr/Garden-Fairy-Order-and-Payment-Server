import { Request, Response, NextFunction } from "express";
import { Plant } from "../models/plant.model";
import { uploadToCloudinary } from "@src/utils/cloudinary-upload";

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

export const uploadPlantImages = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { plantId } = req.params;

        if (!req.files || !(req.files instanceof Array)) {
            return res.status(400).json({ message: "No Images provided" });
        }

        const uploadPromises = req.files.map((file) =>
            uploadToCloudinary(file.buffer)
        );

        const imageUrls = await Promise.all(uploadPromises);

        const plant = await Plant.findByIdAndUpdate(
            plantId,
            { $push: { images: { $each: imageUrls } } },
            { new: true }
        )

        if (!plant) {
            return res.status(404).json({ message: "Plant not found" });
        }

        res.status(200).json({
            message: "Image uploaded Successfully",
            images: plant.imageUrl
        })

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Image upload Failed" })
    }
}

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
