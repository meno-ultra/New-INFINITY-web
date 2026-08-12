const mongoose = require("mongoose");

const EmailVerificationTokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    used: { type: Boolean, default: false, index: true },
}, { timestamps: true });

EmailVerificationTokenSchema.index({ email: 1, used: 1, expiresAt: -1 });

module.exports = mongoose.models.EmailVerificationToken
    || mongoose.model("EmailVerificationToken", EmailVerificationTokenSchema);
