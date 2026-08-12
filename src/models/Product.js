const mongoose = require("mongoose");

const ProductSpecSchema = new mongoose.Schema({
    en: { type: String, default: "" },
    ar: { type: String, default: "" }
}, { _id: false });

const ProductSpecSectionSchema = new mongoose.Schema({
    title: { type: String, default: "" },
    items: { type: [ProductSpecSchema], default: [] }
}, { _id: false });

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

module.exports = mongoose.models.Product || mongoose.model("Product", ProductSchema);
