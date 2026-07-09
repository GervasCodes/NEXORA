const cloudinary = require("../config/cloudinary");

exports.uploadToCloudinary = (fileBuffer, folder = "nexora") => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: folder
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        stream.end(fileBuffer);
    });
};