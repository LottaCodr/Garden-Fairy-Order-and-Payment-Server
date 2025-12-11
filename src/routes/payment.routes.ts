import { Router } from "express";
import { flutterwaveWebhook } from "../controllers/payment.controller";

const router = Router();
router.post("/flutterwave", flutterwaveWebhook);
export default router;
