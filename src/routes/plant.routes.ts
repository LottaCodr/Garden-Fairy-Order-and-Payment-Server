import { Router } from "express";
import { createPlant, getPlants, getPlant, updatePlant, deletePlant } from "../controllers/product.controller";
import { protect } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { upload } from "../utils/multer";
import { uploadPlantImages } from "@src/controllers/plant.controller";

const router = Router();

router.get("/", getPlants);
router.get("/:id", getPlant);

// admin protected
router.post("/", protect, authorize("admin"), upload.array("images", 6), createPlant);
router.post("/:plantId/images", upload.array("images", 5),
    uploadPlantImages)
router.put("/:id", protect, authorize("admin"), upload.array("images", 6), updatePlant);
router.delete("/:id", protect, authorize("admin"), deletePlant);

export default router;
