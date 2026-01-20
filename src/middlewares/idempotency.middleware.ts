import { Request, Response, NextFunction } from "express";
import { IdempotencyKey } from "@src/models/idempotencyKey";

export const idempotency = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const key = req.headers["idempontency-key"] as string;

    //for none-idempotent requests
    if (!key) return;

    const existing = await IdempotencyKey.findOne({
        key,
        enpoint: req.originalUrl
    })

    if (existing) {
        return res.status(200).json(existing.response)
    }

    //monkey-patch to capture response
    const originalJson = res.json.bind(res)

    res.json = (body: any) => {
        IdempotencyKey.create({
            key,
            endpoint: req.originalUrl,
            response: body
        }).catch((err: any) => {
            // Optional: log error, but do not block response
            console.error('Failed to store idempotency record:', err);
        });
        return originalJson(body)
    }
}