import { createOrder } from "@src/controllers/order.controller";
import { protect } from "@src/middlewares/auth.middleware";
import { idempotency } from "@src/middlewares/idempotency.middleware";
import { Router } from "express";

const router = Router()

router.post("/orders", protect, idempotency, createOrder)

export default router;