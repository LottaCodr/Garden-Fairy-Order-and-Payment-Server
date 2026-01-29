import { Router } from "express";
import { idempotency } from "@src/middlewares/idempotency.middleware";
import { flutterwaveWebhook } from "@src/controllers/webhook.controller";
import { initializePayment } from "@src/controllers/payment.controller";

const router = Router();
router.post("/initialize", initializePayment);
router.post("/webhook/flutterwave", idempotency, flutterwaveWebhook);
export default router;
