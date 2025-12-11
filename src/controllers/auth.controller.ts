import { Request, Response, NextFunction } from "express";
import jwt, { Secret } from "jsonwebtoken";
import { User } from "../models/user.model";

// Make sure secret is present and of correct type at runtime
const JWT_SECRET: Secret = process.env.JWT_SECRET || "dev_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const signToken = (userId: string) => {
    return jwt.sign({ userId }, JWT_SECRET, {
        // expiresIn: JWT_EXPIRES_IN,
    });
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, email, password, phone } = req.body;
        const exists = await User.findOne({ email });
        if (exists) return res.status(409).json({ message: "Email already registered" });
        const user = await User.create({ name, email, password, phone });
        const token = signToken(user._id.toString());
        res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (err) { next(err); }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ message: "Invalid credentials" });
        const ok = await user.comparePassword(password);
        if (!ok) return res.status(401).json({ message: "Invalid credentials" });
        const token = signToken(user._id.toString());
        res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (err) { next(err); }
};

export const me = async (req: Request, res: Response) => {
    // user is attached by auth middleware
    res.json({ user: (req as any).user });
};
