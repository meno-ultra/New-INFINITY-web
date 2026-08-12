const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
    "email_verified",
    "ticket_reply",
    "ticket_closed",
    "verification_approved",
    "verification_rejected",
    "verification_reupload",
];

const NotificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    link: { type: String, default: "" },
    read: { type: Boolean, default: false, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = {
    Notification: mongoose.models.Notification || mongoose.model("Notification", NotificationSchema),
    NOTIFICATION_TYPES,
};
