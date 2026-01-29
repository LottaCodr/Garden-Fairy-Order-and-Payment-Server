import cloudinary from "@src/config/cloudinary";

export const uploadToCloudinary = (
    buffer: Buffer,
    folder = "plants"
): Promise<{ url: string; publicId: string }> => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader
            .upload_stream({ folder }, (error, result) => {
                if (error || !result) {
                    return reject(error);
                }
                resolve({
                    url: result.secure_url,
                    publicId: result.public_id
                });
            })
            .end(buffer)
    })
}

export const deleteFromCloudinary = async (publicId: string) => {
    await cloudinary.uploader.destroy(publicId)
}