import { Router } from "express";
import { idempotency } from "@src/middlewares/idempotency.middleware";
import { flutterwaveWebhook } from "@src/controllers/webhook.controller";

const router = Router();
router.post("/flutterwave", idempotency, flutterwaveWebhook);
export default router;
