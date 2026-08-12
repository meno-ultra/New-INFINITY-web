const mongoose = require("mongoose");

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

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
