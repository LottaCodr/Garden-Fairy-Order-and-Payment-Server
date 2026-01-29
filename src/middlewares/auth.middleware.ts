import { User } from "@src/models/user.model";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const protect = async (req: Request, res: Response, next: NextFunction) => {
    let token = "";

    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ message: "Not authenticated" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;

        const user = await User.findById(decoded.userId).select("-password");

        if (!user) return res.status(401).json({ message: "User not found" });

        (req as any).user = user;

        next();
    } catch (err) {
        return res.status(401).json({ message: "Token invalid or expired" });
    }
};
