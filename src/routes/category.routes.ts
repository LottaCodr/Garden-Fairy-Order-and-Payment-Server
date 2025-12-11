import { Router } from "express";
import { createCategory, listCategories } from "../controllers/category.controller";
import { protect } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";

const router = Router();
router.get("/", listCategories);
router.post("/", protect, authorize("admin"), createCategory);

export default router;
