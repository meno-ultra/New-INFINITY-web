const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cloudinary = require("../config/cloudinary");
const { isCloudinaryConfigured } = require("../config/cloudinary");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
]);

function safeId(value) {
    return String(value || "")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 48) || crypto.randomBytes(8).toString("hex");
}

function parseDataUrl(dataUrl) {
    if (typeof dataUrl !== "string") return null;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1].toLowerCase();
    const buffer = Buffer.from(match[2], "base64");
    return { mimeType, buffer, size: buffer.length };
}

function validateUpload(parsed, { allowPdf = true } = {}) {
    if (!parsed) return { valid: false, message: "Invalid file format." };
    if (!ALLOWED_MIME.has(parsed.mimeType)) {
        return { valid: false, message: "Only JPG, PNG, WEBP, and PDF files are allowed." };
    }
    if (parsed.mimeType === "application/pdf") {
        if (!allowPdf) return { valid: false, message: "PDF files are not allowed here." };
        if (parsed.size > MAX_PDF_BYTES) return { valid: false, message: "PDF must be 8 MB or smaller." };
    } else if (parsed.size > MAX_IMAGE_BYTES) {
        return { valid: false, message: "Image must be 5 MB or smaller." };
    }
    return { valid: true, mimeType: parsed.mimeType };
}

async function uploadToCloudinary(dataUrl, { folder, publicId, resourceType = "image" }) {
    const result = await cloudinary.uploader.upload(dataUrl, {
        folder,
        public_id: publicId,
        overwrite: true,
        resource_type: resourceType,
    });
    if (!result?.secure_url) throw new Error("Upload did not return a URL");
    return result.secure_url;
}

const { publicPath } = require("../config/paths");

function saveLocalFile(folder, filename, buffer) {
    const dir = publicPath("assets", folder);
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(dir, filename);
    fs.writeFileSync(full, buffer);
    return `assets/${folder}/${filename}`;
}

async function uploadUserFile(userId, category, label, dataUrl, options = {}) {
    const parsed = parseDataUrl(dataUrl);
    const check = validateUpload(parsed, options);
    if (!check.valid) return { ok: false, message: check.message };

    const id = safeId(`${userId}-${label}-${Date.now()}`);
    const ext = check.mimeType === "application/pdf" ? "pdf"
        : check.mimeType === "image/webp" ? "webp"
        : check.mimeType === "image/png" ? "png" : "jpg";
    const folder = `private/${category}`;

    if (isCloudinaryConfigured()) {
        const url = await uploadToCloudinary(dataUrl, {
            folder,
            publicId: id,
            resourceType: check.mimeType === "application/pdf" ? "raw" : "image",
        });
        return { ok: true, url, mimeType: check.mimeType, filename: `${label}.${ext}` };
    }

    const localPath = saveLocalFile(folder, `${id}.${ext}`, parsed.buffer);
    return { ok: true, url: localPath, mimeType: check.mimeType, filename: `${label}.${ext}` };
}

module.exports = {
    parseDataUrl,
    validateUpload,
    uploadUserFile,
    safeId,
    MAX_IMAGE_BYTES,
    MAX_PDF_BYTES,
};
