require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");
const compression = require("compression");
const bcrypt = require("bcrypt");
const session = require("express-session");
const cors = require("cors");
const mongoose = require("mongoose");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const PDFDocument = require("pdfkit");
const { ArabicShaper } = require("arabic-persian-reshaper");
const cloudinary = require("./cloudinary");
const { isCloudinaryConfigured } = cloudinary;
const realtime = require("./services/realtimeService");
const createAuthMiddleware = require("./middlewares/auth");
const http = require("http");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI in environment (.env).");
}

const SESSION_SECRET = process.env.SESSION_SECRET || "change-me";
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "";
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
const PRIMARY_ADMIN_EMAIL = (process.env.PRIMARY_ADMIN_EMAIL || "").trim().toLowerCase();
const PRIMARY_ADMIN_PASSWORD = process.env.PRIMARY_ADMIN_PASSWORD || "";
const MANAGER_EMAILS = (process.env.MANAGER_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const EMPLOYEE_EMAILS = (process.env.EMPLOYEE_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const {
    requireAuth,
    requireRole,
    getSessionUserObjectId,
    getRoleForEmail,
} = createAuthMiddleware({
    primaryAdminEmail: PRIMARY_ADMIN_EMAIL,
    managerEmails: MANAGER_EMAILS,
    employeeEmails: EMPLOYEE_EMAILS,
});

// Payment configuration (keep secrets in env)
const STRIPE_API_KEY_BASE64 = process.env.STRIPE_API_KEY_BASE64 || "";

// Mock payment processor (for development/testing)
const mockPaymentProcessor = {
    processPayment: async (paymentData) => {
        await new Promise(resolve => setTimeout(resolve, 1500));

        const isSuccess = Math.random() > 0.1;
        if (!isSuccess) {
            throw new Error("Payment declined by bank");
        }

        return {
            success: true,
            transactionId: "txn_" + Math.random().toString(36).slice(2, 11),
            amount: paymentData.amount,
            currency: paymentData.currency
        };
    }
};

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(bodyParser.json({ limit: "12mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "12mb" }));
app.use(compression());
app.use(express.static(__dirname, {
    maxAge: "7d",
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        const base = path.basename(filePath).toLowerCase();
        if (base === "robots.txt" || base === "sitemap.xml") {
            res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        }
        if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
            res.setHeader("Surrogate-Control", "no-store");
        }
    }
}));

const sessionMiddleware = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // set true behind HTTPS
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        collectionName: "sessions",
        ttl: 60 * 60 * 24 * 7 // 7 days
    })
});
app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

// Keep session role in sync with database/email role lists.
app.use(async (req, _res, next) => {
    try {
        if (!req.session?.user?.id) return next();
        const user = await User.findById(req.session.user.id).select("email name role accountType").lean();
        if (!user) {
            req.session.user = null;
            return next();
        }
        const computedRole = getRoleForEmail(user.email) || user.role || "customer";
        if (computedRole !== user.role) {
            await User.updateOne({ _id: user._id }, { $set: { role: computedRole } });
        }
        req.session.user = {
            id: String(user._id),
            email: user.email,
            name: user.name,
            role: computedRole,
            accountType: resolveAccountType(user.accountType),
        };
        next();
    } catch (_err) {
        next();
    }
});

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^(\+20|0)?1[0-2,5]\d{8}$/;

function validateInput(email, password, name = null) {
    if (!email || !password) {
        return { valid: false, message: "Email and password are required" };
    }
    if (!emailRegex.test(email)) {
        return { valid: false, message: "Invalid email format" };
    }
    if (password.length < 6) {
        return { valid: false, message: "Password must be at least 6 characters long" };
    }
    if (name && name.length < 2) {
        return { valid: false, message: "Name must be at least 2 characters long" };
    }
    return { valid: true };
}

function computeAgeFromDateOfBirth(dateOfBirth) {
    if (!dateOfBirth) return null;
    const birth = new Date(dateOfBirth);
    if (Number.isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age -= 1;
    }
    return age;
}

function validateRegistrationProfile(profile = {}) {
    const {
        phone,
        age,
        dateOfBirth,
        gender,
        state,
        companyName,
        companyLocation
    } = profile;

    if (!phone || !phoneRegex.test(String(phone).trim())) {
        return { valid: false, message: "Please enter a valid Egyptian phone number" };
    }

    const parsedAge = age != null && age !== ""
        ? Number(age)
        : computeAgeFromDateOfBirth(dateOfBirth);
    if (!Number.isInteger(parsedAge) || parsedAge < 18 || parsedAge > 100) {
        return { valid: false, message: "You must be between 18 and 100 years old." };
    }

    const allowedGenders = ["male", "female", "prefer_not_to_say"];
    if (!allowedGenders.includes(gender)) {
        return { valid: false, message: "Please select a valid gender" };
    }

    if (!state || String(state).trim().length < 2) {
        return { valid: false, message: "State in Egypt is required" };
    }

    if (companyName && String(companyName).trim().length > 120) {
        return { valid: false, message: "Company name is too long" };
    }

    if (companyLocation && String(companyLocation).trim().length > 200) {
        return { valid: false, message: "Company location is too long" };
    }

    return { valid: true };
}

const IdentityDocumentSchema = new mongoose.Schema({
    type: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
    status: {
        type: String,
        enum: ["draft", "pending", "approved", "rejected"],
        default: "draft",
    },
    rejectionReason: { type: String, default: "" },
}, { _id: false });

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: null, trim: true },
    age: { type: Number, default: null },
    gender: { type: String, enum: ["male", "female", "prefer_not_to_say"], default: null },
    state: { type: String, default: null, trim: true },
    companyName: { type: String, default: null, trim: true },
    companyLocation: { type: String, default: null, trim: true },
    role: { type: String, enum: ["customer", "technical", "employee", "manager", "primary"], default: "customer" },
    provider: { type: String, default: "local" },
    providerId: { type: String, default: null },
    accountType: { type: String, enum: ["personal", "company"], default: "personal", index: true },
    emailVerified: { type: Boolean, default: false, index: true },
    contactPerson: { type: String, default: null, trim: true },
    address: { type: String, default: null, trim: true },
    city: { type: String, default: null, trim: true },
    country: { type: String, default: "Egypt", trim: true },
    dateOfBirth: { type: Date, default: null },
    taxNumber: { type: String, default: null, trim: true },
    companyWebsite: { type: String, default: null, trim: true },
    companyAddress: { type: String, default: null, trim: true },
    profilePicture: { type: String, default: null },
    companyLogo: { type: String, default: null },
    identityVerification: {
        status: {
            type: String,
            enum: ["none", "pending", "approved", "rejected", "reupload_requested"],
            default: "none",
        },
        documents: { type: [IdentityDocumentSchema], default: [] },
        staffNotes: { type: String, default: "" },
        submittedAt: { type: Date, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
    },
}, { timestamps: true });

const OrderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    transactionId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "EGP" },
    customerName: { type: String },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String },
    customerState: { type: String },
    customerAge: { type: Number },
    customerGender: { type: String },
    customerCompanyName: { type: String },
    customerCompanyLocation: { type: String },
    billingAddress: { type: String },
    orderItems: { type: Array, default: [] },
    paymentMethod: { type: String, default: "visa" },
    paymentReceiptImage: { type: String, default: "" },
    status: { type: String, default: "completed" },
    vatApplied: { type: Boolean, default: false }
}, { timestamps: true });

const CartItemSchema = new mongoose.Schema({
    id: { type: String, required: true }, // product id from UI
    name: { type: String, required: true },
    price: { type: Number, required: true },
    installation: { type: Number, default: 0 },
    quantity: { type: Number, required: true, min: 1 }
}, { _id: false });

const CartSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    items: { type: [CartItemSchema], default: [] },
}, { timestamps: true });

const ProductSpecSchema = new mongoose.Schema({
    en: { type: String, default: "" },
    ar: { type: String, default: "" }
}, { _id: false });

const ProductSpecSectionSchema = new mongoose.Schema({
    title: { type: String, default: "" },
    items: { type: [ProductSpecSchema], default: [] }
}, { _id: false });

const TEAM_CATEGORIES = ["leadership", "technical", "employees", "operations", "sales"];
const TEAM_CATEGORY_LABELS = {
    leadership: "Leadership",
    technical: "Technical Team",
    employees: "Employees",
    operations: "Operations",
    sales: "Sales & Support",
};

const TeamMemberSchema = new mongoose.Schema({
    memberId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    positionTitle: { type: String, default: "", trim: true },
    bio: { type: String, default: "" },
    category: { type: String, enum: TEAM_CATEGORIES, default: "employees" },
    skills: { type: [String], default: [] },
    image: { type: String, default: "" },
    badge: { type: String, default: "", trim: true },
    featured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
}, { timestamps: true });

const ProductSchema = new mongoose.Schema({
    productId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    nameAr: { type: String, default: "" },
    image: { type: String, default: "" },
    price: { type: Number, required: true, default: 0 },
    installation: { type: Number, required: true, default: 0 },
    stock: { type: Number, required: true, default: 0, min: 0 },
    descriptionEn: { type: String, default: "" },
    descriptionAr: { type: String, default: "" },
    category: { type: String, default: "gps" },
    specs: { type: [ProductSpecSchema], default: [] },
    specSections: { type: [ProductSpecSectionSchema], default: [] },
    active: { type: Boolean, default: true }
}, { timestamps: true });

const PUBLIC_PRODUCT_FIELDS = "productId name nameAr image price installation stock descriptionEn descriptionAr category specs specSections active -_id";

function slugifyProductId(value) {
    const slug = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
    return slug || `product-${Date.now()}`;
}

function slugifyMemberId(value) {
    const slug = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
    return slug || `member-${Date.now()}`;
}

function parseTeamSkills(raw) {
    if (Array.isArray(raw)) {
        return raw.map((s) => String(s).trim()).filter(Boolean).slice(0, 12);
    }
    if (typeof raw === "string") {
        return raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
    }
    return [];
}

function groupTeamMembersByCategory(members = []) {
    const byCategory = {};
    TEAM_CATEGORIES.forEach((id) => { byCategory[id] = []; });
    members.forEach((m) => {
        const cat = TEAM_CATEGORIES.includes(m.category) ? m.category : "employees";
        byCategory[cat].push(m);
    });
    return TEAM_CATEGORIES
        .map((id) => ({
            id,
            label: TEAM_CATEGORY_LABELS[id] || id,
            members: (byCategory[id] || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
        }))
        .filter((section) => section.members.length > 0);
}

function parseSpecLine(line) {
    const parts = String(line || "").split("|").map((s) => s.trim());
    const en = parts[0] || "";
    const ar = parts[1] || parts[0] || "";
    if (!en && !ar) return null;
    return { en, ar: ar || en };
}

function normalizeProductSpecs(rawSpecs, descriptionEn = "", descriptionAr = "") {
    const specs = [];
    if (Array.isArray(rawSpecs)) {
        rawSpecs.forEach((row) => {
            if (!row) return;
            if (typeof row === "string") {
                const parsed = parseSpecLine(row);
                if (parsed) specs.push(parsed);
                return;
            }
            const en = String(row.en || "").trim();
            const ar = String(row.ar || "").trim();
            if (en || ar) specs.push({ en, ar: ar || en });
        });
    } else if (typeof rawSpecs === "string" && rawSpecs.trim()) {
        rawSpecs.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => {
            const parsed = parseSpecLine(line);
            if (parsed) specs.push(parsed);
        });
    }
    if (!specs.length) {
        const en = String(descriptionEn || "").trim();
        const ar = String(descriptionAr || "").trim();
        if (en || ar) specs.push({ en, ar: ar || en });
    }
    return specs;
}

function normalizeSpecSections(rawSections, rawSpecs, descriptionEn = "", descriptionAr = "") {
    const sections = [];

    const pushSection = (title, itemsInput) => {
        const titleText = String(title || "").trim();
        const items = normalizeProductSpecs(itemsInput);
        if (!titleText || !items.length) return;
        sections.push({ title: titleText, items });
    };

    if (Array.isArray(rawSections)) {
        rawSections.forEach((section) => {
            if (!section) return;
            if (typeof section === "string") {
                const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
                if (!lines.length) return;
                const title = lines[0].replace(/^\[SECTION\]\s*/i, "").trim();
                pushSection(title, lines.slice(1));
                return;
            }
            pushSection(section.title, section.items || section.specs || []);
        });
    } else if (typeof rawSections === "string" && rawSections.trim()) {
        let currentTitle = "";
        let currentLines = [];
        const flush = () => {
            if (currentTitle && currentLines.length) {
                pushSection(currentTitle, currentLines);
            }
            currentTitle = "";
            currentLines = [];
        };
        rawSections.split("\n").forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const isSectionHeader = /^\[SECTION\]/i.test(trimmed)
                || /^\d+\.\s/.test(trimmed)
                || (/^[\u0600-\u06FF]/.test(trimmed) && !trimmed.includes("|") && trimmed.length < 90);
            if (isSectionHeader && (currentTitle || currentLines.length)) {
                flush();
            }
            if (/^\[SECTION\]/i.test(trimmed)) {
                currentTitle = trimmed.replace(/^\[SECTION\]\s*/i, "").trim();
                return;
            }
            if (/^\d+\.\s/.test(trimmed) && !trimmed.includes("|")) {
                currentTitle = trimmed;
                return;
            }
            if (!currentTitle) currentTitle = "1. المواصفات الفنية";
            currentLines.push(trimmed);
        });
        flush();
    }

    if (sections.length) {
        return sections;
    }

    const flatSpecs = normalizeProductSpecs(rawSpecs, descriptionEn, descriptionAr);
    if (flatSpecs.length) {
        return [{ title: "1. المواصفات الفنية", items: flatSpecs }];
    }
    return [];
}

function savePaymentReceipt(orderId, imageData) {
    if (typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
        throw new Error("Invalid payment receipt image format");
    }
    const match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) throw new Error("Invalid payment receipt image format");
    let ext = String(match[1] || "png").toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    if (!["png", "jpg", "webp", "gif"].includes(ext)) ext = "jpg";
    const safeId = String(orderId || "").replace(/[^a-fA-F0-9]/g, "") || Date.now().toString();
    const rel = `assets/orders/receipts/${safeId}.${ext}`;
    const abs = path.join(__dirname, rel);
    try {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, Buffer.from(match[2], "base64"));
    } catch (err) {
        throw new Error(`Could not save payment receipt: ${err.message}`);
    }
    return rel;
}

async function uploadPaymentReceipt(orderId, imageData) {
    if (typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
        throw new Error("Invalid payment receipt image format");
    }
    const safeId = String(orderId || "").replace(/[^a-fA-F0-9]/g, "");
    if (!safeId) throw new Error("Invalid order id for receipt upload");

    if (isCloudinaryConfigured()) {
        const result = await cloudinary.uploader.upload(imageData, {
            folder: "payment-receipts",
            public_id: safeId,
            overwrite: true,
            resource_type: "image",
        });
        if (!result?.secure_url) {
            throw new Error("Cloudinary upload did not return a URL");
        }
        return result.secure_url;
    }

    console.warn("Cloudinary not configured — saving receipt to local disk. Set CLOUDINARY_* in .env for production.");
    return savePaymentReceipt(safeId, imageData);
}

async function deletePaymentReceiptAsset(orderId, receiptImage) {
    const safeId = String(orderId || "").replace(/[^a-fA-F0-9]/g, "");
    if (!safeId || !receiptImage) return;

    if (String(receiptImage).includes("res.cloudinary.com") && isCloudinaryConfigured()) {
        try {
            await cloudinary.uploader.destroy(`payment-receipts/${safeId}`, { resource_type: "image" });
        } catch (err) {
            console.warn("Cloudinary receipt delete failed:", err?.message || err);
        }
        return;
    }

    if (String(receiptImage).startsWith("assets/orders/receipts/")) {
        const abs = path.join(__dirname, receiptImage);
        try {
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch (err) {
            console.warn("Local receipt delete failed:", err?.message || err);
        }
    }
}

function cloudinarySafeProductId(productId) {
    const id = String(productId || "")
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    return id || "product";
}

function saveProductImageLocal(productId, imageData) {
    const match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) throw new Error("Invalid image upload format");
    let ext = String(match[1] || "png").toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    if (!["png", "jpg", "webp", "gif"].includes(ext)) ext = "jpg";
    const rel = `assets/products/${productId}.${ext}`;
    const abs = path.join(__dirname, rel);
    try {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, Buffer.from(match[2], "base64"));
    } catch (err) {
        throw new Error(`Could not save image file: ${err.message}`);
    }
    return rel;
}

async function uploadProductImage(productId, imageData) {
    if (typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
        throw new Error("Invalid product image format");
    }
    const publicId = cloudinarySafeProductId(productId);
    if (!publicId) throw new Error("Invalid product id for image upload");

    if (isCloudinaryConfigured()) {
        const result = await cloudinary.uploader.upload(imageData, {
            folder: "products",
            public_id: publicId,
            overwrite: true,
            resource_type: "image",
        });
        if (!result?.secure_url) {
            throw new Error("Cloudinary upload did not return a URL");
        }
        return result.secure_url;
    }

    console.warn("Cloudinary not configured — saving product image to local disk. Set CLOUDINARY_* in .env for production.");
    return saveProductImageLocal(productId, imageData);
}

async function deleteProductImageAsset(productId, imageUrl) {
    if (!imageUrl) return;
    const publicId = `products/${cloudinarySafeProductId(productId)}`;

    if (String(imageUrl).includes("res.cloudinary.com") && isCloudinaryConfigured()) {
        try {
            await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
        } catch (err) {
            console.warn("Cloudinary product image delete failed:", err?.message || err);
        }
        return;
    }

    if (String(imageUrl).startsWith("assets/products/")) {
        const abs = path.join(__dirname, imageUrl);
        try {
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch (err) {
            console.warn("Local product image delete failed:", err?.message || err);
        }
    }
}

async function resolveProductImage(productId, imagePath, imageData) {
    if (typeof imageData === "string" && imageData.startsWith("data:image/")) {
        return uploadProductImage(productId, imageData);
    }
    if (typeof imagePath === "string" && imagePath.trim()) return imagePath.trim();
    return "";
}

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function findPdfFontPaths() {
    const fontsDir = path.join(process.env.WINDIR || "C:\\Windows", "Fonts");
    const pick = (names) => names.map((name) => path.join(fontsDir, name)).find((p) => fs.existsSync(p)) || null;
    return {
        latin: pick(["arial.ttf", "segoeui.ttf"]),
        arabic: pick(["tahoma.ttf", "trado.ttf", "arabtype.ttf", "arial.ttf"]),
    };
}

function normalizePdfText(text) {
    if (text == null || text === "") return "";
    return String(text).replace(/\s+/g, " ").trim();
}

function formatArabicWordsForPdf(words) {
    return words.map((word) => ArabicShaper.convertArabic(word)).reverse().join(" ");
}

function measureArabicLineWidth(doc, words) {
    if (!words.length) return 0;
    return doc.widthOfString(formatArabicWordsForPdf(words));
}

function wrapArabicTextLines(doc, text, maxWidth) {
    const words = normalizePdfText(text).split(" ").filter(Boolean);
    if (!words.length) return [];

    const lines = [];
    let current = [];

    for (const word of words) {
        const trial = current.concat(word);
        if (current.length && measureArabicLineWidth(doc, trial) > maxWidth) {
            lines.push(current);
            current = [word];
        } else {
            current = trial;
        }
    }
    if (current.length) lines.push(current);
    return lines;
}

function shapeTextForPdf(text) {
    const str = normalizePdfText(text);
    if (!str) return "-";
    if (!ARABIC_SCRIPT_RE.test(str)) return str;
    if (/[A-Za-z]/.test(str)) return ArabicShaper.convertArabic(str);

    const words = str.split(" ").filter(Boolean);
    return formatArabicWordsForPdf(words);
}

function writePdfMultilineField(doc, label, value, pageWidth) {
    const str = normalizePdfText(value);
    doc.text(`${label}:`);
    if (!str) {
        doc.text("-");
        return;
    }

    if (!ARABIC_SCRIPT_RE.test(str) || /[A-Za-z]/.test(str)) {
        doc.text(shapeTextForPdf(str), { width: pageWidth });
        return;
    }

    const lines = wrapArabicTextLines(doc, str, pageWidth);
    for (const lineWords of lines) {
        doc.text(formatArabicWordsForPdf(lineWords), { width: pageWidth });
    }
}

function registerPdfFonts(doc) {
    const { latin, arabic } = findPdfFontPaths();
    const fontName = arabic ? "PdfUI" : (latin ? "PdfUI" : null);
    const fontPath = arabic || latin;
    if (fontPath && fontName) {
        doc.registerFont(fontName, fontPath);
        doc.font(fontName);
    }
}

function localImageAbs(rawPath) {
    if (!rawPath || typeof rawPath !== "string") return null;
    if (/^https?:\/\//i.test(rawPath)) return null;
    const normalized = rawPath.replace(/^\/+/, "").replace(/\\/g, "/");
    const abs = path.join(__dirname, normalized);
    return fs.existsSync(abs) ? abs : null;
}

async function fetchImageBuffer(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error("Empty image response");
    return buf;
}

async function resolvePdfImage(rawPath, defaultRel = "assets/images/infinity-logo.png") {
    const candidates = [rawPath, defaultRel].filter(Boolean);
    for (const candidate of candidates) {
        const local = localImageAbs(candidate);
        if (local) return { kind: "path", value: local };
        if (/^https?:\/\//i.test(String(candidate))) {
            try {
                return { kind: "buffer", value: await fetchImageBuffer(candidate) };
            } catch (err) {
                console.warn("PDF image fetch failed:", candidate, err?.message || err);
            }
        }
    }
    return null;
}

function drawPdfImage(doc, source, x, y, options) {
    if (!source) return;
    try {
        doc.image(source.value, x, y, options);
    } catch (_err) {
        // ignore unsupported/corrupt images
    }
}

async function writeOrderPdf(order, doc, { title = "INFINITY - Order Report", detailed = false } = {}) {
    registerPdfFonts(doc);

    const pageWidth = doc.page.width - 72;
    const defaultLogo = "assets/images/infinity-logo.png";
    const items = Array.isArray(order.orderItems) ? order.orderItems : [];
    const itemIds = items.map((i) => String(i?.id || "")).filter(Boolean);
    const products = itemIds.length
        ? await Product.find({ productId: { $in: itemIds } }).select("productId image nameAr -_id").lean()
        : [];
    const imageByProductId = {};
    const nameArByProductId = {};
    products.forEach((p) => {
        imageByProductId[p.productId] = p.image;
        nameArByProductId[p.productId] = p.nameAr;
    });

    doc.fillColor("#0f172a").fontSize(20).text(title, { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Order ID: ${order._id}`);
    doc.text(`Transaction ID: ${order.transactionId || "-"}`);
    doc.text(`Created At: ${new Date(order.createdAt).toLocaleString()}`);
    doc.text(`Status: ${order.status || "-"}`);
    doc.moveDown(0.5);

    doc.fontSize(13).text("Customer");
    doc.fontSize(11);
    doc.text(`Name: ${shapeTextForPdf(order.customerName || "-")}`);
    doc.text(`Email: ${order.customerEmail || "-"}`);
    doc.text(`Phone: ${shapeTextForPdf(order.customerPhone || "-")}`);
    doc.text(`State: ${shapeTextForPdf(order.customerState || "-")}`);
    if (detailed) {
        doc.text(`Company: ${shapeTextForPdf(order.customerCompanyName || "-")}`);
        doc.text(`Company Location: ${shapeTextForPdf(order.customerCompanyLocation || "-")}`);
        writePdfMultilineField(doc, "Billing Address", order.billingAddress, pageWidth);
    }
    doc.moveDown(0.5);

    doc.fontSize(13).text("Payment");
    doc.fontSize(11);
    doc.text(`Method: ${order.paymentMethod || "-"}`);
    doc.text(`Currency: ${order.currency || "EGP"}`);
    doc.text(`Amount: ${Number(order.amount || 0).toFixed(2)}`);
    if (detailed) {
        doc.text(`VAT Applied: ${order.vatApplied ? "Yes" : "No"}`);
    }
    doc.moveDown(0.8);

    doc.fontSize(13).text("Order Items");
    doc.moveDown(0.4);

    for (const item of items) {
        if (doc.y > 720) doc.addPage();

        const blockTop = doc.y;
        const blockHeight = 70;
        doc.roundedRect(36, blockTop - 2, pageWidth, blockHeight, 8).fillColor("#f8fafc").fill();
        doc.fillColor("#0f172a");

        const productId = String(item?.id || "");
        const preferredImage = item?.image || imageByProductId[productId] || defaultLogo;
        const imageSource = await resolvePdfImage(preferredImage, defaultLogo);
        drawPdfImage(doc, imageSource, 44, blockTop + 6, { fit: [52, 52] });

        const startX = 106;
        const startY = blockTop + 6;
        const nameAr = item.nameAr || nameArByProductId[productId] || "";
        const lineName = nameAr
            ? `${shapeTextForPdf(item.name || "Item")} / ${shapeTextForPdf(nameAr)} x ${item.quantity || 1}`
            : `${shapeTextForPdf(item.name || "Item")} x ${item.quantity || 1}`;
        doc.fontSize(11).text(lineName, startX, startY, { width: pageWidth - 120 });
        doc.fontSize(10).fillColor("#334155").text(`Price: EGP ${Number(item.price || 0).toFixed(2)}`, startX, startY + 18);
        doc.text(`Installation: EGP ${Number(item.installation || 0).toFixed(2)}`, startX, startY + 33);

        doc.y = blockTop + blockHeight + 6;
    }
}

function saveTeamMemberImageLocal(memberId, imageData) {
    const match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) throw new Error("Invalid image upload format");
    let ext = String(match[1] || "png").toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    if (!["png", "jpg", "webp", "gif"].includes(ext)) ext = "jpg";
    const rel = `assets/images/team/${memberId}.${ext}`;
    const abs = path.join(__dirname, rel);
    try {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, Buffer.from(match[2], "base64"));
    } catch (err) {
        throw new Error(`Could not save image file: ${err.message}`);
    }
    return rel;
}

async function uploadTeamMemberImage(memberId, imageData) {
    if (typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
        throw new Error("Invalid team member image format");
    }
    const publicId = cloudinarySafeProductId(memberId);
    if (!publicId) throw new Error("Invalid member id for image upload");

    if (isCloudinaryConfigured()) {
        const result = await cloudinary.uploader.upload(imageData, {
            folder: "team",
            public_id: publicId,
            overwrite: true,
            resource_type: "image",
        });
        if (!result?.secure_url) {
            throw new Error("Cloudinary upload did not return a URL");
        }
        return result.secure_url;
    }

    console.warn("Cloudinary not configured — saving team photo to local disk.");
    return saveTeamMemberImageLocal(memberId, imageData);
}

async function deleteTeamMemberImageAsset(memberId, imageUrl) {
    if (!imageUrl) return;
    const publicId = `team/${cloudinarySafeProductId(memberId)}`;

    if (String(imageUrl).includes("res.cloudinary.com") && isCloudinaryConfigured()) {
        try {
            await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
        } catch (err) {
            console.warn("Cloudinary team image delete failed:", err?.message || err);
        }
        return;
    }

    if (String(imageUrl).startsWith("assets/images/team/")) {
        const abs = path.join(__dirname, imageUrl);
        try {
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch (err) {
            console.warn("Local team image delete failed:", err?.message || err);
        }
    }
}

async function resolveTeamMemberImage(memberId, imagePath, imageData) {
    if (typeof imageData === "string" && imageData.startsWith("data:image/")) {
        return uploadTeamMemberImage(memberId, imageData);
    }
    if (typeof imagePath === "string" && imagePath.trim()) return imagePath.trim();
    return "";
}

const User = mongoose.model("User", UserSchema);
const Order = mongoose.model("Order", OrderSchema);
const Cart = mongoose.model("Cart", CartSchema);
const Product = mongoose.model("Product", ProductSchema);
const TeamMember = mongoose.model("TeamMember", TeamMemberSchema);

async function seedDefaultTeamMembers() {
    const defaults = [
        {
            memberId: "mohamed-zidan",
            name: "Mohamed Zidan",
            positionTitle: "Managing Director",
            bio: "Leads INFINITY in delivering GPS tracking, fleet management, and security solutions for businesses across Egypt.",
            category: "leadership",
            skills: ["GPS Systems", "Fleet Management", "CCTV Systems"],
            image: "assets/images/team/mohamed-zidan.jpg",
            featured: false,
            sortOrder: 0,
            active: true,
        },
        {
            memberId: "mazen-mahmoud",
            name: "Mazen Mahmoud Mohamed",
            positionTitle: "Communication & Computer Engineer",
            bio: "Designed and built this website and its online store, staff dashboard, and customer portal — connecting our catalog, orders, and team tools in one platform.",
            category: "technical",
            skills: ["Web Development", "Full-Stack", "Node.js", "Communication Systems", "Computer Engineering"],
            image: "assets/images/team/mazen-mahmoud.jpg",
            badge: "Platform builder",
            featured: true,
            sortOrder: 0,
            active: true,
        },
    ];
    for (const m of defaults) {
        const existing = await TeamMember.findOne({ memberId: m.memberId }).lean();
        if (!existing) {
            await TeamMember.create(m);
            continue;
        }
        const patch = {};
        if (!existing.name) patch.name = m.name;
        if (!existing.positionTitle) patch.positionTitle = m.positionTitle;
        if (!existing.bio) patch.bio = m.bio;
        if (!existing.image) patch.image = m.image;
        if (!existing.skills?.length) patch.skills = m.skills;
        if (!TEAM_CATEGORIES.includes(existing.category)) patch.category = m.category;
        if (typeof existing.active !== "boolean") patch.active = m.active;
        if (Object.keys(patch).length) {
            await TeamMember.updateOne({ memberId: m.memberId }, { $set: patch });
        }
    }
    await TeamMember.updateMany({ active: { $exists: false } }, { $set: { active: true } });
}

async function seedDefaultProducts() {
    const defaults = [
        { productId: "fmb120", name: "GPS Tracker FMB120", image: "assets/products/fmb120.png", price: 3475, installation: 325, stock: 25, active: true },
        { productId: "cut-off", name: "Cut Off Engine", image: "assets/products/cut-off-engine.png", price: 170, installation: 80, stock: 50, active: true },
        { productId: "door-sensor", name: "Door Sensor", image: "assets/products/door-sensor.png", price: 240, installation: 350, stock: 40, active: true },
        { productId: "driver-button", name: "Driver ID Button", image: "assets/products/driver-button.png", price: 1220, installation: 0, stock: 30, active: true },
    ];
    for (const p of defaults) {
        const existing = await Product.findOne({ productId: p.productId }).lean();
        if (!existing) {
            await Product.create(p);
            continue;
        }

        // Backfill only missing fields; do NOT overwrite manager edits.
        const patch = {};
        if (!existing.name) patch.name = p.name;
        if (!existing.image) patch.image = p.image;
        if (typeof existing.price !== "number") patch.price = p.price;
        if (typeof existing.installation !== "number") patch.installation = p.installation;
        if (typeof existing.stock !== "number") patch.stock = p.stock;
        if (typeof existing.active !== "boolean") patch.active = p.active;
        if (Object.keys(patch).length) {
            await Product.updateOne({ productId: p.productId }, { $set: patch });
        }
    }
}

async function syncRoleFromEmailLists(user) {
    if (!user) return user;
    const expectedRole = getRoleForEmail(user.email);
    if (expectedRole && user.role !== expectedRole) {
        user.role = expectedRole;
        await user.save();
    }
    return user;
}

function resolveAccountType(value) {
    return String(value || "").trim().toLowerCase() === "company" ? "company" : "personal";
}

function getMissingProfileFields(user) {
    if (!user) return [];
    const missing = [];
    if (!user.passwordHash) missing.push("password");
    if (!user.phone) missing.push("phone");
    if (!user.state) missing.push("state");
    const accountType = resolveAccountType(user.accountType);
    if (accountType === "company") {
        if (!user.companyName) missing.push("companyName");
        if (!user.companyLocation) missing.push("companyLocation");
    }
    return missing;
}

async function ensurePrimaryAdmin() {
    if (!PRIMARY_ADMIN_EMAIL || !PRIMARY_ADMIN_PASSWORD) return;
    const existing = await User.findOne({ email: PRIMARY_ADMIN_EMAIL });
    if (!existing) {
        const passwordHash = await bcrypt.hash(PRIMARY_ADMIN_PASSWORD, 10);
        await User.create({
            email: PRIMARY_ADMIN_EMAIL,
            name: "Primary Admin",
            passwordHash,
            role: "primary",
            provider: "local",
            emailVerified: true,
            accountType: "personal",
        });
        return;
    }
    if (existing.role !== "primary") {
        existing.role = "primary";
        await existing.save();
    }
}

async function releaseStock(orderItems = []) {
    const cleanItems = (Array.isArray(orderItems) ? orderItems : [])
        .filter(i => i && i.id && Number(i.quantity) > 0)
        .map(i => ({ id: String(i.id), quantity: Number(i.quantity) }));

    for (const item of cleanItems) {
        await Product.findOneAndUpdate(
            { productId: item.id },
            { $inc: { stock: item.quantity } }
        );
    }
}

async function reserveStock(orderItems = []) {
    const cleanItems = (Array.isArray(orderItems) ? orderItems : [])
        .filter(i => i && i.id && Number(i.quantity) > 0)
        .map(i => ({ id: String(i.id), quantity: Number(i.quantity) }));

    for (const item of cleanItems) {
        const updated = await Product.findOneAndUpdate(
            { productId: item.id, active: true, stock: { $gte: item.quantity } },
            { $inc: { stock: -item.quantity } },
            { new: true }
        );
        if (!updated) {
            throw new Error(`Product ${item.id} is out of stock or not enough quantity`);
        }
    }
}

passport.serializeUser((user, done) => {
    done(null, String(user._id));
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user || false);
    } catch (err) {
        done(err);
    }
});

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy(
        {
            clientID: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
            callbackURL: `${APP_BASE_URL}/auth/google/callback`,
        },
        async (_accessToken, _refreshToken, profile, done) => {
            try {
                const email = profile?.emails?.[0]?.value?.toLowerCase();
                if (!email) return done(new Error("Google account has no email"));

                let user = await User.findOne({ email });
                if (!user) {
                    user = await User.create({
                        email,
                        name: profile.displayName || "Google User",
                        role: getRoleForEmail(email) || "customer",
                        provider: "google",
                        providerId: profile.id,
                        passwordHash: null,
                        emailVerified: true,
                        accountType: "personal",
                    });
                } else if (!user.providerId) {
                    user.provider = "google";
                    user.providerId = profile.id;
                    if (!user.emailVerified) user.emailVerified = true;
                    await user.save();
                }
                user = await syncRoleFromEmailLists(user);

                return done(null, user);
            } catch (err) {
                return done(err);
            }
        }
    ));
}

if (FACEBOOK_APP_ID && FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy(
        {
            clientID: FACEBOOK_APP_ID,
            clientSecret: FACEBOOK_APP_SECRET,
            callbackURL: `${APP_BASE_URL}/auth/facebook/callback`,
            profileFields: ["id", "displayName", "emails"],
        },
        async (_accessToken, _refreshToken, profile, done) => {
            try {
                const email = profile?.emails?.[0]?.value?.toLowerCase();
                if (!email) return done(new Error("Facebook account has no email"));

                let user = await User.findOne({ email });
                if (!user) {
                    user = await User.create({
                        email,
                        name: profile.displayName || "Facebook User",
                        role: getRoleForEmail(email) || "customer",
                        provider: "facebook",
                        providerId: profile.id,
                        passwordHash: null,
                        emailVerified: true,
                        accountType: "personal",
                    });
                } else if (!user.providerId) {
                    user.provider = "facebook";
                    user.providerId = profile.id;
                    if (!user.emailVerified) user.emailVerified = true;
                    await user.save();
                }
                user = await syncRoleFromEmailLists(user);

                return done(null, user);
            } catch (err) {
                return done(err);
            }
        }
    ));
}

mongoose.set("strictQuery", true);
async function start() {
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 8000,
        });
        await ensurePrimaryAdmin();
        await seedDefaultProducts();
        await seedDefaultTeamMembers();
        console.log("Connected to MongoDB");

        const { migrateExistingUsers } = require("./services/migrateUsers");
        await migrateExistingUsers(User);

        const { initializeMailService } = require("./services/mail/mailService");
        await initializeMailService();

        const server = http.createServer(app);
        realtime.init(server, sessionMiddleware);
        server.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("MongoDB connection error.");
        console.error("Fixes to try:");
        console.error("- Make sure your `.env` has a valid MONGODB_URI");
        console.error("- In MongoDB Atlas: Network Access → add your IP (or 0.0.0.0/0 for testing)");
        console.error("- If your password has special characters, URL-encode it");
        console.error("Raw error:", err?.message || err);
        process.exit(1);
    }
}

// Payment processing endpoint
app.post("/api/process-payment", requireAuth, async (req, res) => {
    try {
        const {
            cardNumber,
            expiryDate,
            cvv,
            cardholderName,
            billingEmail,
            billingPhone,
            billingAddress,
            amount,
            currency,
            orderItems
        } = req.body;

        // Validate required fields
        if (!cardNumber || !expiryDate || !cvv || !cardholderName || !billingEmail || !amount) {
            return res.status(400).json({ error: "Missing required payment information" });
        }

        // Basic card validation
        if (cardNumber.length < 13 || cardNumber.length > 19) {
            return res.status(400).json({ error: "Invalid card number" });
        }

        if (cvv.length < 3 || cvv.length > 4) {
            return res.status(400).json({ error: "Invalid CVV" });
        }

        // Process payment using mock processor (swap to Stripe later)
        const paymentResult = await mockPaymentProcessor.processPayment({
            cardNumber,
            expiryDate,
            cvv,
            cardholderName,
            billingEmail,
            billingPhone,
            billingAddress,
            amount,
            currency,
            orderItems
        });

        if (paymentResult.success) {
            await reserveStock(orderItems);
            const user = await User.findById(req.session.user.id).lean();
            const order = await Order.create({
                userId: getSessionUserObjectId(req),
                transactionId: paymentResult.transactionId,
                amount: amount,
                currency: currency,
                customerName: user?.name || req.session.user.name,
                customerEmail: billingEmail || req.session.user.email,
                customerPhone: billingPhone || user?.phone || null,
                customerState: user?.state || null,
                customerAge: user?.age ?? null,
                customerGender: user?.gender || null,
                customerCompanyName: user?.companyName || null,
                customerCompanyLocation: user?.companyLocation || null,
                billingAddress: billingAddress,
                orderItems: orderItems,
                paymentMethod: "visa",
                status: "completed"
            });

            realtime.emitNewOrder(order);

            res.json({
                success: true,
                transactionId: paymentResult.transactionId,
                amount: amount,
                currency: currency,
                orderId: order._id
            });
        } else {
            res.status(400).json({ error: "Payment failed" });
        }

    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({ 
            error: error.message || "Payment processing failed" 
        });
    }
});

// Non-card orders (bank transfer / instapay / cash)
app.post("/api/orders", requireAuth, async (req, res) => {
    try {
        const { paymentMethod, amount, currency, orderItems, vatApplied, paymentReceiptData } = req.body || {};
        if (!paymentMethod || typeof amount !== "number" || !currency) {
            return res.status(400).json({ error: "Missing order information" });
        }
        const method = String(paymentMethod).toLowerCase();
        const needsReceipt = method === "bank" || method === "instapay";
        if (needsReceipt && !paymentReceiptData) {
            return res.status(400).json({ error: "Payment receipt image is required for this payment method" });
        }
        await reserveStock(orderItems);

        const user = await User.findById(req.session.user.id).lean();
        const order = await Order.create({
            userId: getSessionUserObjectId(req),
            transactionId: "manual_" + Math.random().toString(36).slice(2, 11),
            amount,
            currency,
            customerName: user?.name || req.session.user.name,
            customerEmail: req.session.user.email,
            customerPhone: user?.phone || null,
            customerState: user?.state || null,
            customerAge: user?.age ?? null,
            customerGender: user?.gender || null,
            customerCompanyName: user?.companyName || null,
            customerCompanyLocation: user?.companyLocation || null,
            orderItems: Array.isArray(orderItems) ? orderItems : [],
            paymentMethod: method,
            status: "pending",
            vatApplied: !!vatApplied
        });

        if (needsReceipt) {
            try {
                const receiptUrl = await uploadPaymentReceipt(String(order._id), paymentReceiptData);
                order.paymentReceiptImage = receiptUrl;
                await order.save();
            } catch (uploadErr) {
                await releaseStock(orderItems);
                await Order.deleteOne({ _id: order._id });
                console.error("Payment receipt upload failed:", uploadErr);
                return res.status(500).json({
                    error: uploadErr?.message || "Could not upload payment receipt. Please try again."
                });
            }
        }

        realtime.emitNewOrder(order);

        res.json({ success: true, orderId: order._id });
    } catch (error) {
        console.error("Create order error:", error);
        res.status(500).json({ error: error?.message || "Internal server error" });
    }
});

// Public products with live stock for storefront
app.get("/api/products/public", async (_req, res) => {
    try {
        const products = await Product.find({ active: true })
            .select(PUBLIC_PRODUCT_FIELDS)
            .sort({ createdAt: 1, productId: 1 })
            .lean();
        res.json({ products });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/products/public/:productId", async (req, res) => {
    try {
        const product = await Product.findOne({ productId: req.params.productId, active: true })
            .select(PUBLIC_PRODUCT_FIELDS)
            .lean();
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json({ product });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/team/public", async (_req, res) => {
    try {
        const members = await TeamMember.find({ active: { $ne: false } })
            .select("memberId name positionTitle bio category skills image badge featured sortOrder -_id")
            .sort({ sortOrder: 1, name: 1 })
            .lean();
        const categories = groupTeamMembersByCategory(members);
        res.json({
            categories,
            categoryLabels: TEAM_CATEGORY_LABELS,
            total: members.length,
        });
    } catch (error) {
        console.error("Public team list failed:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Cart (account-based) - persists across refresh/devices while logged in
app.get("/api/cart", requireAuth, async (req, res) => {
    try {
        const userId = getSessionUserObjectId(req);
        const cart = await Cart.findOne({ userId });
        res.json({ items: cart?.items || [] });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.put("/api/cart", requireAuth, async (req, res) => {
    try {
        const userId = getSessionUserObjectId(req);
        const items = Array.isArray(req.body?.items) ? req.body.items : [];

        // Basic sanitization
        const normalized = items
            .filter(i => i && typeof i.id === "string" && typeof i.name === "string")
            .map(i => ({
                id: String(i.id),
                name: String(i.name).slice(0, 200),
                price: Number(i.price || 0),
                installation: Number(i.installation || 0),
                quantity: Math.max(1, Number(i.quantity || 1)),
                ...(typeof i.image === "string" && i.image.trim()
                    ? { image: String(i.image).trim().slice(0, 500) }
                    : {}),
            }));

        const cart = await Cart.findOneAndUpdate(
            { userId },
            { $set: { items: normalized } },
            { upsert: true, new: true }
        );

        res.json({ items: cart.items });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.delete("/api/cart", requireAuth, async (req, res) => {
    try {
        const userId = getSessionUserObjectId(req);
        await Cart.findOneAndUpdate(
            { userId },
            { $set: { items: [] } },
            { upsert: true }
        );
        res.json({ message: "Cart cleared" });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// List current user's orders (for verification/debugging)
app.get("/api/orders/me", requireAuth, async (req, res) => {
    try {
        const userId = getSessionUserObjectId(req);
        const orders = await Order.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();

        const productIds = new Set();
        orders.forEach((o) => {
            (o.orderItems || []).forEach((item) => {
                if (item?.id) productIds.add(String(item.id));
            });
        });
        const products = await Product.find({ productId: { $in: Array.from(productIds) } })
            .select("productId image -_id")
            .lean();
        const imageByProductId = {};
        products.forEach((p) => {
            imageByProductId[p.productId] = p.image;
        });

        const enrichedOrders = orders.map((o) => ({
            ...o,
            orderItems: (o.orderItems || []).map((item) => ({
                ...item,
                image: item?.image || imageByProductId[String(item?.id || "")] || "assets/images/infinity-logo.png"
            }))
        }));

        res.json({ orders: enrichedOrders });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).lean();
        if (!order) return res.status(404).json({ error: "Order not found" });

        const role = req.session?.user?.role || "customer";
        const isStaff = ["technical", "employee", "manager", "primary"].includes(role);
        const ownerId = String(order.userId || "");
        const sessionUserId = String(getSessionUserObjectId(req) || "");
        if (!isStaff && ownerId !== sessionUserId) {
            return res.status(403).json({ error: "Not allowed" });
        }

        const orderItems = Array.isArray(order.orderItems) ? order.orderItems : [];
        const missingImageIds = orderItems
            .filter((item) => item && item.id && !item.image)
            .map((item) => String(item.id));

        let imageById = {};
        if (missingImageIds.length) {
            const products = await Product.find({ productId: { $in: missingImageIds } })
                .select("productId image -_id")
                .lean();
            imageById = products.reduce((acc, p) => {
                acc[p.productId] = p.image;
                return acc;
            }, {});
        }

        const enrichedOrder = {
            ...order,
            orderItems: orderItems.map((item) => ({
                ...item,
                image: item?.image || imageById[String(item?.id || "")] || "assets/images/infinity-logo.png"
            }))
        };

        res.json({ order: enrichedOrder });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/orders/:id/pdf", requireAuth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).lean();
        if (!order) return res.status(404).json({ error: "Order not found" });

        const role = req.session?.user?.role || "customer";
        const isStaff = ["technical", "employee", "manager", "primary"].includes(role);
        const ownerId = String(order.userId || "");
        const sessionUserId = String(getSessionUserObjectId(req) || "");
        if (!isStaff && ownerId !== sessionUserId) {
            return res.status(403).json({ error: "Not allowed" });
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="order-${order.transactionId || order._id}.pdf"`);
        const doc = new PDFDocument({ margin: 36, size: "A4" });
        doc.pipe(res);
        await writeOrderPdf(order, doc, {
            title: "INFINITY - Customer Order",
            detailed: true,
        });
        doc.end();
    } catch (error) {
        console.error("Customer order PDF failed:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

// Staff dashboard endpoints
app.get("/api/dashboard/products", requireRole(["technical", "employee", "manager", "primary"]), async (_req, res) => {
    try {
        const products = await Product.find({}).sort({ productId: 1 }).lean();
        res.json({ products });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.patch("/api/dashboard/products/:productId/stock", requireRole(["employee", "manager", "primary"]), async (req, res) => {
    try {
        const { productId } = req.params;
        const body = req.body || {};
        const { stock, name, nameAr, active, price, installation, image, imageData, descriptionEn, descriptionAr, category, specs, specSections } = body;
        if (typeof stock !== "number" || stock < 0) {
            return res.status(400).json({ error: "Stock must be a non-negative number" });
        }
        const update = { stock: Math.floor(stock) };
        if (typeof name === "string" && name.trim()) update.name = name.trim();
        if (typeof nameAr === "string") update.nameAr = nameAr.trim();
        if (typeof active === "boolean") update.active = active;
        if (typeof price === "number" && price >= 0) update.price = price;
        if (typeof installation === "number" && installation >= 0) update.installation = installation;
        if (typeof descriptionEn === "string") update.descriptionEn = descriptionEn.trim();
        if (typeof descriptionAr === "string") update.descriptionAr = descriptionAr.trim();
        if (typeof category === "string" && category.trim()) update.category = category.trim();
        if (specSections !== undefined) {
            const sections = normalizeSpecSections(specSections, specs, descriptionEn, descriptionAr);
            update.specSections = sections;
            update.specs = sections.flatMap((sec) => sec.items);
        } else if (specs !== undefined) {
            const flat = normalizeProductSpecs(specs, descriptionEn, descriptionAr);
            update.specs = flat;
            update.specSections = flat.length ? [{ title: "1. المواصفات الفنية", items: flat }] : [];
        }
        const existing = await Product.findOne({ productId }).lean();
        if (!existing) return res.status(404).json({ error: "Product not found" });

        let savedImage = "";
        try {
            savedImage = await resolveProductImage(productId, image, imageData);
        } catch (imgErr) {
            return res.status(400).json({ error: imgErr.message || "Failed to save product image" });
        }
        if (savedImage) {
            if (existing.image && savedImage !== existing.image) {
                await deleteProductImageAsset(productId, existing.image);
            }
            update.image = savedImage;
        } else if (typeof image === "string" && image.trim()) {
            const trimmed = image.trim();
            if (existing.image && trimmed !== existing.image) {
                await deleteProductImageAsset(productId, existing.image);
            }
            update.image = trimmed;
        }

        const product = await Product.findOneAndUpdate(
            { productId },
            { $set: update },
            { new: true }
        );
        if (!product) return res.status(404).json({ error: "Product not found" });
        realtime.emitProductUpdated(productId, "updated");
        res.json({ product });
    } catch (error) {
        console.error("Update product failed:", error);
        res.status(500).json({ error: error?.message || "Internal server error" });
    }
});

app.post("/api/dashboard/products", requireRole(["manager", "primary"]), async (req, res) => {
    try {
        const body = req.body || {};
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) return res.status(400).json({ error: "Product name (English) is required" });

        const price = Number(body.price);
        const installation = Number(body.installation ?? 0);
        const stock = Number(body.stock ?? 0);
        if (!Number.isFinite(price) || price < 0) {
            return res.status(400).json({ error: "Price must be a non-negative number" });
        }
        if (!Number.isFinite(installation) || installation < 0) {
            return res.status(400).json({ error: "Installation must be a non-negative number" });
        }
        if (!Number.isFinite(stock) || stock < 0) {
            return res.status(400).json({ error: "Stock must be a non-negative number" });
        }

        const productId = slugifyProductId(body.productId || name);
        const existing = await Product.findOne({ productId }).lean();
        if (existing) return res.status(409).json({ error: "Product ID already exists. Choose a different ID." });

        let image = "";
        try {
            image = await resolveProductImage(productId, body.image, body.imageData);
        } catch (imgErr) {
            return res.status(400).json({ error: imgErr.message || "Failed to save product image" });
        }
        if (!image) return res.status(400).json({ error: "Product image is required (upload a file or provide a path)" });

        const descriptionEn = typeof body.descriptionEn === "string" ? body.descriptionEn.trim() : "";
        const descriptionAr = typeof body.descriptionAr === "string" ? body.descriptionAr.trim() : "";
        const category = typeof body.category === "string" && body.category.trim()
            ? body.category.trim()
            : "gps";

        const specSections = normalizeSpecSections(body.specSections, body.specs, descriptionEn, descriptionAr);
        const flatSpecs = specSections.flatMap((sec) => sec.items);

        const product = await Product.create({
            productId,
            name,
            nameAr: typeof body.nameAr === "string" ? body.nameAr.trim() : "",
            image,
            price,
            installation,
            stock: Math.floor(stock),
            descriptionEn,
            descriptionAr,
            category,
            specs: flatSpecs,
            specSections,
            active: body.active !== false
        });

        realtime.emitProductUpdated(productId, "created");

        res.status(201).json({ product });
    } catch (error) {
        console.error("Create product failed:", error);
        if (error && error.code === 11000) {
            return res.status(409).json({ error: "Product ID already exists" });
        }
        res.status(500).json({ error: error?.message || "Internal server error" });
    }
});

app.delete("/api/dashboard/products/:productId", requireRole(["manager", "primary"]), async (req, res) => {
    try {
        const { productId } = req.params;
        const permanent = String(req.query.permanent || "") === "1";
        const existing = await Product.findOne({ productId }).lean();
        if (!existing) return res.status(404).json({ error: "Product not found" });

        if (permanent) {
            await deleteProductImageAsset(productId, existing.image);
            await Product.deleteOne({ productId });
            realtime.emitProductUpdated(productId, "deleted");
            return res.json({ message: "Product permanently deleted", productId, permanent: true });
        }

        const product = await Product.findOneAndUpdate(
            { productId },
            { $set: { active: false, stock: 0 } },
            { new: true }
        );
        realtime.emitProductUpdated(productId, "updated");
        res.json({
            message: "Product removed from store",
            productId,
            permanent: false,
            product
        });
    } catch (error) {
        console.error("Delete product failed:", error);
        res.status(500).json({ error: error?.message || "Internal server error" });
    }
});

app.get("/api/dashboard/orders", requireRole(["technical", "employee", "manager", "primary"]), async (req, res) => {
    try {
        const { status } = req.query;
        const filter = {};
        if (status) filter.status = status;
        const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(300).lean();

        // Enrich missing order item images from current product catalog.
        const productIds = new Set();
        orders.forEach((o) => {
            (o.orderItems || []).forEach((item) => {
                if (item?.id) productIds.add(String(item.id));
            });
        });
        const products = await Product.find({ productId: { $in: Array.from(productIds) } })
            .select("productId image -_id")
            .lean();
        const imageByProductId = {};
        products.forEach((p) => {
            imageByProductId[p.productId] = p.image;
        });

        const enrichedOrders = orders.map((o) => ({
            ...o,
            orderItems: (o.orderItems || []).map((item) => ({
                ...item,
                image: item?.image || imageByProductId[String(item?.id || "")] || "assets/images/infinity-logo.png"
            }))
        }));

        res.json({ orders: enrichedOrders });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.patch("/api/dashboard/orders/:id/status", requireRole(["employee", "manager", "primary"]), async (req, res) => {
    try {
        const allowedStatuses = ["pending", "processing", "completed", "cancelled", "failed"];
        const { status } = req.body || {};
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }
        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { $set: { status } },
            { new: true }
        );
        if (!order) return res.status(404).json({ error: "Order not found" });
        realtime.emitOrderUpdated(order);
        res.json({ order });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/dashboard/orders/:id/pdf", requireRole(["technical", "employee", "manager", "primary"]), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).lean();
        if (!order) return res.status(404).json({ error: "Order not found" });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="order-${order.transactionId || order._id}.pdf"`);

        const doc = new PDFDocument({ margin: 36, size: "A4" });
        doc.pipe(res);
        await writeOrderPdf(order, doc, {
            title: "INFINITY - Order Report",
            detailed: true,
        });
        doc.end();
    } catch (error) {
        console.error("Dashboard order PDF failed:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

function canManageUsers(role) {
    return ["employee", "manager", "primary"].includes(role);
}

function canDeleteRole(actorRole, targetRole) {
    if (targetRole === "primary") return false;
    if (actorRole === "primary") return true;
    if (actorRole === "manager") return targetRole !== "primary";
    if (actorRole === "employee") return !["primary", "manager"].includes(targetRole);
    return false;
}

app.get("/api/dashboard/users", requireRole(["technical", "employee", "manager", "primary"]), async (_req, res) => {
    try {
        const users = await User.find({ role: { $in: ["technical", "employee", "manager", "primary"] } })
            .select("email name role phone state companyName createdAt")
            .sort({ createdAt: -1 })
            .lean();
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/dashboard/customers", requireRole(["technical", "employee", "manager", "primary"]), async (_req, res) => {
    try {
        const customers = await User.find({ role: "customer" })
            .select("name email phone age gender state companyName companyLocation accountType emailVerified identityVerification.status profilePicture createdAt")
            .sort({ createdAt: -1 })
            .lean();
        res.json({ customers });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/dashboard/users", requireRole(["manager", "primary"]), async (req, res) => {
    try {
        const actorRole = req.session.user.role;
        if (!canManageUsers(actorRole)) return res.status(403).json({ error: "Not authorized" });

        const { name, email, password, role } = req.body || {};
        const allowedRoles = ["technical", "employee", "manager"];
        if (!name || !email || !password || !role) return res.status(400).json({ error: "Missing required fields" });
        if (!allowedRoles.includes(role)) return res.status(400).json({ error: "Invalid role" });

        const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
        if (existing) return res.status(400).json({ error: "Email already registered" });

        const passwordHash = await bcrypt.hash(String(password), 10);
        const user = await User.create({
            name: String(name).trim(),
            email: String(email).toLowerCase().trim(),
            passwordHash,
            role,
            provider: "local",
        });
        realtime.emitUserCreated(user._id);
        res.json({ user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.delete("/api/dashboard/users/:id", requireRole(["employee", "manager", "primary"]), async (req, res) => {
    try {
        const actorRole = req.session.user.role;
        const actorId = String(req.session.user.id);
        const target = await User.findById(req.params.id);
        if (!target) return res.status(404).json({ error: "User not found" });
        if (String(target._id) === actorId) return res.status(400).json({ error: "You cannot delete yourself" });

        if (!canDeleteRole(actorRole, target.role)) {
            return res.status(403).json({ error: "You cannot delete this role" });
        }
        await User.deleteOne({ _id: target._id });
        realtime.emitUserUpdated(target._id);
        res.json({ message: "User deleted" });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/dashboard/team", requireRole(["manager", "primary"]), async (_req, res) => {
    try {
        const members = await TeamMember.find({})
            .sort({ category: 1, sortOrder: 1, name: 1 })
            .lean();
        res.json({
            members,
            categories: TEAM_CATEGORIES,
            categoryLabels: TEAM_CATEGORY_LABELS,
        });
    } catch (error) {
        console.error("Dashboard team list failed:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/dashboard/team", requireRole(["manager", "primary"]), async (req, res) => {
    try {
        const body = req.body || {};
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) return res.status(400).json({ error: "Name is required" });

        const category = typeof body.category === "string" ? body.category.trim() : "employees";
        if (!TEAM_CATEGORIES.includes(category)) {
            return res.status(400).json({ error: "Invalid team category" });
        }

        const memberId = slugifyMemberId(body.memberId || name);
        const existing = await TeamMember.findOne({ memberId }).lean();
        if (existing) return res.status(409).json({ error: "Member ID already exists. Choose a different ID." });

        let image = "";
        try {
            image = await resolveTeamMemberImage(memberId, body.image, body.imageData);
        } catch (imgErr) {
            return res.status(400).json({ error: imgErr.message || "Failed to save team photo" });
        }
        if (!image) {
            return res.status(400).json({ error: "Photo is required (upload a file or provide an image path)" });
        }

        const member = await TeamMember.create({
            memberId,
            name,
            positionTitle: typeof body.positionTitle === "string" ? body.positionTitle.trim() : "",
            bio: typeof body.bio === "string" ? body.bio.trim() : "",
            category,
            skills: parseTeamSkills(body.skills),
            image,
            badge: typeof body.badge === "string" ? body.badge.trim() : "",
            featured: body.featured === true,
            sortOrder: Number.isFinite(Number(body.sortOrder)) ? Math.floor(Number(body.sortOrder)) : 0,
            active: body.active !== false,
        });

        res.status(201).json({ member });
    } catch (error) {
        console.error("Create team member failed:", error);
        if (error && error.code === 11000) {
            return res.status(409).json({ error: "Member ID already exists" });
        }
        res.status(500).json({ error: error?.message || "Internal server error" });
    }
});

app.patch("/api/dashboard/team/:memberId", requireRole(["manager", "primary"]), async (req, res) => {
    try {
        const { memberId } = req.params;
        const body = req.body || {};
        const existing = await TeamMember.findOne({ memberId }).lean();
        if (!existing) return res.status(404).json({ error: "Team member not found" });

        const update = {};
        if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
        if (typeof body.positionTitle === "string") update.positionTitle = body.positionTitle.trim();
        if (typeof body.bio === "string") update.bio = body.bio.trim();
        if (typeof body.category === "string") {
            if (!TEAM_CATEGORIES.includes(body.category)) {
                return res.status(400).json({ error: "Invalid team category" });
            }
            update.category = body.category;
        }
        if (body.skills !== undefined) update.skills = parseTeamSkills(body.skills);
        if (typeof body.badge === "string") update.badge = body.badge.trim();
        if (typeof body.featured === "boolean") update.featured = body.featured;
        if (typeof body.active === "boolean") update.active = body.active;
        if (Number.isFinite(Number(body.sortOrder))) update.sortOrder = Math.floor(Number(body.sortOrder));

        let savedImage = "";
        try {
            savedImage = await resolveTeamMemberImage(memberId, body.image, body.imageData);
        } catch (imgErr) {
            return res.status(400).json({ error: imgErr.message || "Failed to save team photo" });
        }
        if (savedImage) {
            if (existing.image && savedImage !== existing.image) {
                await deleteTeamMemberImageAsset(memberId, existing.image);
            }
            update.image = savedImage;
        } else if (typeof body.image === "string" && body.image.trim()) {
            const trimmed = body.image.trim();
            if (existing.image && trimmed !== existing.image) {
                await deleteTeamMemberImageAsset(memberId, existing.image);
            }
            update.image = trimmed;
        }

        const member = await TeamMember.findOneAndUpdate(
            { memberId },
            { $set: update },
            { new: true }
        );
        res.json({ member });
    } catch (error) {
        console.error("Update team member failed:", error);
        res.status(500).json({ error: error?.message || "Internal server error" });
    }
});

app.delete("/api/dashboard/team/:memberId", requireRole(["manager", "primary"]), async (req, res) => {
    try {
        const { memberId } = req.params;
        const permanent = String(req.query.permanent || "") === "1";
        const existing = await TeamMember.findOne({ memberId }).lean();
        if (!existing) return res.status(404).json({ error: "Team member not found" });

        if (permanent) {
            await deleteTeamMemberImageAsset(memberId, existing.image);
            await TeamMember.deleteOne({ memberId });
            return res.json({ message: "Team member permanently deleted", memberId, permanent: true });
        }

        const member = await TeamMember.findOneAndUpdate(
            { memberId },
            { $set: { active: false } },
            { new: true }
        );
        res.json({
            message: "Team member hidden from Our Team page",
            memberId,
            permanent: false,
            member,
        });
    } catch (error) {
        console.error("Delete team member failed:", error);
        res.status(500).json({ error: error?.message || "Internal server error" });
    }
});

// Allow user to modify/delete their own PENDING orders
app.patch("/api/orders/:id", requireAuth, async (req, res) => {
    try {
        const userId = getSessionUserObjectId(req);
        const orderId = new mongoose.Types.ObjectId(req.params.id);

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) return res.status(404).json({ error: "Order not found" });
        if (order.status !== "pending") return res.status(400).json({ error: "Only pending orders can be modified" });

        const { orderItems, amount, vatApplied } = req.body || {};
        if (Array.isArray(orderItems)) order.orderItems = orderItems;
        if (typeof amount === "number") order.amount = amount;
        if (typeof vatApplied === "boolean") order.vatApplied = vatApplied;

        await order.save();
        res.json({ order });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.delete("/api/orders/:id", requireAuth, async (req, res) => {
    try {
        const userId = getSessionUserObjectId(req);
        const orderId = new mongoose.Types.ObjectId(req.params.id);

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) return res.status(404).json({ error: "Order not found" });
        if (order.status !== "pending") return res.status(400).json({ error: "Only pending orders can be deleted" });

        await deletePaymentReceiptAsset(String(order._id), order.paymentReceiptImage);
        await Order.deleteOne({ _id: orderId, userId });
        res.json({ message: "Order deleted" });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/auth/google", (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({ error: "Google OAuth is not configured" });
    }
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

app.get("/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", { session: false }, async (err, user) => {
        if (err || !user) return res.redirect("/auth.html?error=google_auth_failed");
        req.session.user = { id: String(user._id), email: user.email, name: user.name, role: user.role || "customer" };
        const missing = getMissingProfileFields(user);
        if (missing.length) {
            return res.redirect("/complete-profile.html");
        }
        return res.redirect((["employee", "manager", "primary", "technical"].includes(user.role)) ? "/dashboard.html" : "/index.html");
    })(req, res, next);
});

app.get("/auth/facebook", (req, res, next) => {
    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
        return res.status(500).json({ error: "Facebook OAuth is not configured" });
    }
    passport.authenticate("facebook", { scope: ["email"] })(req, res, next);
});

app.get("/auth/facebook/callback", (req, res, next) => {
    passport.authenticate("facebook", { session: false }, async (err, user) => {
        if (err || !user) return res.redirect("/auth.html?error=facebook_auth_failed");
        req.session.user = { id: String(user._id), email: user.email, name: user.name, role: user.role || "customer" };
        const missing = getMissingProfileFields(user);
        if (missing.length) {
            return res.redirect("/complete-profile.html");
        }
        return res.redirect((["employee", "manager", "primary", "technical"].includes(user.role)) ? "/dashboard.html" : "/index.html");
    })(req, res, next);
});

app.post("/api/register", async (req, res) => {
    try {
        const {
            email, password, name, phone, age, gender, state, companyName, companyLocation,
            accountType, address, city, country, dateOfBirth, contactPerson,
            taxNumber, companyWebsite, companyAddress, companyLogo,
        } = req.body;

        const type = resolveAccountType(accountType);
        const displayName = type === "company"
            ? String(contactPerson || name || "").trim()
            : String(name || "").trim();

        const validation = validateInput(email, password, displayName);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.message });
        }

        if (type === "personal" && accountType !== "company") {
            const computedAge = age != null && age !== "" ? Number(age) : computeAgeFromDateOfBirth(dateOfBirth);
            const profileValidation = validateRegistrationProfile({
                phone, age: computedAge, dateOfBirth, gender, state, companyName, companyLocation,
            });
            if (!profileValidation.valid) {
                return res.status(400).json({ error: profileValidation.message });
            }
        } else {
            if (!phone || !String(phone).trim()) {
                return res.status(400).json({ error: "Phone number is required." });
            }
            if (!companyName || !String(companyName).trim()) {
                return res.status(400).json({ error: "Company name is required." });
            }
        }

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ error: "Email already registered" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const assignedRole = getRoleForEmail(email) || "customer";
        const isStaff = ["employee", "manager", "primary", "technical"].includes(assignedRole);
        const computedAge = age != null && age !== "" ? Number(age) : computeAgeFromDateOfBirth(dateOfBirth);

        let logoUrl = null;
        if (type === "company" && companyLogo) {
            try {
                const { uploadUserFile } = require("./services/uploadService");
                const tempId = email.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
                const logoResult = await uploadUserFile(tempId, "company", "logo", companyLogo, { allowPdf: false });
                if (logoResult.ok) logoUrl = logoResult.url;
            } catch (_e) { /* optional field */ }
        }

        const user = await User.create({
            email,
            passwordHash,
            name: displayName,
            role: assignedRole,
            accountType: type,
            emailVerified: isStaff,
            phone: phone ? String(phone).trim() : null,
            age: computedAge != null && Number.isFinite(computedAge) ? computedAge : null,
            gender: gender || null,
            state: state ? String(state).trim() : null,
            companyName: type === "company" ? String(companyName).trim() : (companyName ? String(companyName).trim() : null),
            companyLocation: companyLocation ? String(companyLocation).trim() : null,
            contactPerson: type === "company" ? displayName : null,
            address: address ? String(address).trim() : (companyAddress ? String(companyAddress).trim() : null),
            companyAddress: companyAddress ? String(companyAddress).trim() : null,
            city: city ? String(city).trim() : null,
            country: country ? String(country).trim() : "Egypt",
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            taxNumber: taxNumber ? String(taxNumber).trim() : null,
            companyWebsite: companyWebsite ? String(companyWebsite).trim() : null,
            companyLogo: logoUrl,
        });

        if (!isStaff) {
            const emailVerificationService = require("./services/emailVerificationService");
            const { isMailConfigured, MailDeliveryError } = require("./services/mail/mailService");
            if (!isMailConfigured()) {
                await User.deleteOne({ _id: user._id });
                return res.status(503).json({ error: "Email service is temporarily unavailable." });
            }
            try {
                await emailVerificationService.createAndSendVerification(User, user);
            } catch (mailErr) {
                await User.deleteOne({ _id: user._id });
                if (mailErr instanceof MailDeliveryError) {
                    return res.status(mailErr.status || 500).json({ error: mailErr.message, code: mailErr.code });
                }
                throw mailErr;
            }
            realtime.emitCustomerUpdated(user._id, "created");
            return res.json({
                message: "Registration successful! Please check your email to verify your account.",
                requiresVerification: true,
                email: user.email,
            });
        }

        req.session.user = { id: String(user._id), email: user.email, name: user.name, role: user.role || "customer" };
        if (assignedRole === "customer") {
            realtime.emitCustomerUpdated(user._id, "created");
        }
        res.json({
            message: "Registration successful!",
            user: { email: user.email, name: user.name, role: user.role || "customer" },
        });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ error: "Email already registered" });
        }
        console.error("Register error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const validation = validateInput(email, password);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.message });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({ error: "Invalid email or password" });
        }
        await syncRoleFromEmailLists(user);

        if (!user.emailVerified) {
            return res.status(403).json({
                error: "Please verify your email before signing in.",
                code: "EMAIL_NOT_VERIFIED",
                email: user.email,
            });
        }

        req.session.user = { id: String(user._id), email: user.email, name: user.name, role: user.role || "customer" };
        res.json({ message: "Login successful!", user: { email: user.email, name: user.name, role: user.role || "customer" } });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/user", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Not authenticated" });
    }
    if (!req.session.user.role) {
        const user = await User.findById(req.session.user.id).select("role").lean();
        req.session.user.role = user?.role || "customer";
    }
    const dbUser = await User.findById(req.session.user.id)
        .select("phone passwordHash emailVerified accountType state companyName companyLocation identityVerification profilePicture")
        .lean();

    let unreadNotifications = 0;
    try {
        const { getUnreadCount } = require("./services/notificationService");
        unreadNotifications = await getUnreadCount(req.session.user.id);
    } catch (_e) { /* non-fatal */ }

    const resolvedAccountType = resolveAccountType(dbUser?.accountType ?? req.session.user?.accountType);

    res.json({
        user: {
            ...req.session.user,
            emailVerified: dbUser?.emailVerified !== false,
            accountType: resolvedAccountType,
            identityStatus: dbUser?.identityVerification?.status || "none",
            profilePicture: dbUser?.profilePicture || null,
        },
        missingProfileFields: getMissingProfileFields(dbUser),
        unreadNotifications,
    });
});

app.get("/api/profile/onboarding", requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id)
            .select("accountType phone passwordHash state companyName companyLocation role provider")
            .lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        res.json({
            accountType: resolveAccountType(user.accountType),
            accountTypeLocked: user.provider === "local",
            missingProfileFields: getMissingProfileFields(user),
            role: user.role || req.session.user.role || "customer",
        });
    } catch (_err) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/profile/complete", requireAuth, async (req, res) => {
    try {
        const {
            password,
            phone,
            state,
            companyName,
            companyLocation,
            accountType: bodyAccountType,
        } = req.body || {};

        const user = await User.findById(req.session.user.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        if (!password || String(password).length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
        }
        if (!phone || !String(phone).trim()) {
            return res.status(400).json({ error: "Phone number is required" });
        }
        if (!state || !String(state).trim()) {
            return res.status(400).json({ error: "State is required" });
        }

        const accountTypeLocked = user.provider === "local";
        const accountType = accountTypeLocked
            ? resolveAccountType(user.accountType)
            : resolveAccountType(bodyAccountType);

        if (!accountTypeLocked) {
            user.accountType = accountType;
        }

        if (accountType === "company") {
            if (!companyName || !String(companyName).trim()) {
                return res.status(400).json({ error: "Company name is required" });
            }
            if (!companyLocation || !String(companyLocation).trim()) {
                return res.status(400).json({ error: "Company location is required" });
            }
        }

        user.passwordHash = await bcrypt.hash(String(password), 10);
        user.phone = String(phone).trim();
        user.state = String(state).trim();
        if (accountType === "company") {
            user.companyName = String(companyName).trim();
            user.companyLocation = String(companyLocation).trim();
        }

        await user.save();
        realtime.emitCustomerUpdated(user._id, "updated");
        if (req.session.user) {
            req.session.user.accountType = accountType;
        }
        res.json({ message: "Profile completed successfully" });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy();
    res.json({ message: "Logged out successfully" });
});

const createPasswordResetRouter = require("./routes/passwordResetRoutes");
app.use("/api/password-reset", createPasswordResetRouter({ User }));

const createEmailVerificationRouter = require("./routes/emailVerificationRoutes");
app.use("/api/email-verification", createEmailVerificationRouter({ User }));

const createSupportRouter = require("./routes/supportRoutes");
app.use("/api/support", createSupportRouter({ User, requireAuth, requireRole }));

const createProfileRouter = require("./routes/profileRoutes");
app.use("/api/profile", createProfileRouter({ User, requireAuth }));

const createNotificationRouter = require("./routes/notificationRoutes");
app.use("/api/notifications", createNotificationRouter({ requireAuth }));

const createDashboardSupportRouter = require("./routes/dashboardSupportRoutes");
app.use("/api/dashboard/support", createDashboardSupportRouter({ User, requireRole }));

const createDashboardVerificationRouter = require("./routes/dashboardVerificationRoutes");
app.use("/api/dashboard/verification", createDashboardVerificationRouter({ User, requireRole }));

app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found. Restart the server with npm start." });
});

app.use((err, req, res, _next) => {
    if (err && (err.type === "entity.too.large" || err.status === 413)) {
        return res.status(413).json({
            error: "Upload is too large. Use a smaller image (under 3 MB) or enter an image path instead."
        });
    }
    console.error("Unhandled server error:", err);
    if (req.path && req.path.startsWith("/api")) {
        return res.status(500).json({ error: err?.message || "Internal server error" });
    }
    res.status(500).send("Internal server error");
});

start();