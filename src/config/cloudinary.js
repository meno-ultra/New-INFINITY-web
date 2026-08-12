const cloudinary = require("cloudinary").v2;

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
const apiKey = process.env.CLOUDINARY_API_KEY || "";
const apiSecret = process.env.CLOUDINARY_API_SECRET || "";

if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
    });
}

function isCloudinaryConfigured() {
    return Boolean(cloudName && apiKey && apiSecret);
}

module.exports = cloudinary;
module.exports.isCloudinaryConfigured = isCloudinaryConfigured;
