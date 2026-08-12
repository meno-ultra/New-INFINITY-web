const mongoose = require("mongoose");

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

module.exports = mongoose.models.Order || mongoose.model("Order", OrderSchema);
