import { Router } from "express";
import { flutterwaveWebhook } from "../controllers/payment.controller";
import { idempotency } from "@src/middlewares/Idempotency.middleware";

const router = Router();
router.post("/flutterwave", idempotency, flutterwaveWebhook);
export default router;
