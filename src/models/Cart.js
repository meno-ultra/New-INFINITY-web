const mongoose = require("mongoose");

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

module.exports = mongoose.models.Cart || mongoose.model("Cart", CartSchema);
