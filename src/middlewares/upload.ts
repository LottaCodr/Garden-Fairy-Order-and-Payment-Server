import multer from "multer";

const storage = multer.memoryStorage();


export const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (_, file, cb)=> {
        if(!file.mimeType.startsWith("/image/")) {
            cb(new Error("Only image files are allowed"));
        } else {
            cb(null, true);
        }
    }
})