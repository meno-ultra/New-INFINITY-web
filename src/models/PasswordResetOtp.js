const mongoose = require("mongoose");

const PasswordResetOtpSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    used: { type: Boolean, default: false, index: true },
    verifyAttempts: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

PasswordResetOtpSchema.index({ email: 1, used: 1, expiresAt: -1 });

module.exports = mongoose.models.PasswordResetOtp
    || mongoose.model("PasswordResetOtp", PasswordResetOtpSchema);
