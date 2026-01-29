import cloudinary from "@src/config/cloudinary";

export const uploadToCloudinary = (
    buffer: Buffer,
    folder = "plants"
): Promise<string> => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader
            .upload_stream({ folder }, (error, result) => {
                if (error || !result) {
                    return reject(error);
                }
                resolve(result.secure_url);
            })
            .end(buffer)
    })
}