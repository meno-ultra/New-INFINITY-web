const mongoose = require("mongoose");

const TICKET_CATEGORIES = [
    "technical",
    "billing",
    "product",
    "complaint",
    "suggestion",
    "account",
    "other",
];

const TICKET_STATUSES = [
    "open",
    "in_progress",
    "waiting_customer",
    "resolved",
    "closed",
];

const TicketMessageSchema = new mongoose.Schema({
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    authorRole: { type: String, default: "customer" },
    authorName: { type: String, default: "" },
    body: { type: String, required: true, trim: true },
    attachments: [{
        filename: { type: String, default: "" },
        url: { type: String, default: "" },
        mimeType: { type: String, default: "" },
    }],
}, { timestamps: true });

const SupportTicketSchema = new mongoose.Schema({
    ticketNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, enum: TICKET_CATEGORIES, required: true },
    status: { type: String, enum: TICKET_STATUSES, default: "open", index: true },
    messages: { type: [TicketMessageSchema], default: [] },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

module.exports = {
    SupportTicket: mongoose.models.SupportTicket || mongoose.model("SupportTicket", SupportTicketSchema),
    TICKET_CATEGORIES,
    TICKET_STATUSES,
};
