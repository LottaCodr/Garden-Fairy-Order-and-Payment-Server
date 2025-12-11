import { Router } from "express";
import { register, login, me } from "../controllers/auth.controller";
import { protect } from "@src/middlewares/auth.middleware";

const router = Router();
router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, me);

export default router;
